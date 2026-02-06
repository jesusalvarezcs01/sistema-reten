const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- INSTALACIÓN MAESTRA (JA12) ---
app.get('/setup_master_v2', async (req, res) => {
  try {
    // Limpieza en orden de dependencia
    await pool.query('DROP TABLE IF EXISTS intentos_fallidos;');
    await pool.query('DROP TABLE IF EXISTS referidos;');
    await pool.query('DROP TABLE IF EXISTS equipo_trabajo;'); // NUEVA TABLA
    await pool.query('DROP TABLE IF EXISTS usuarios;');
    
    // 1. USUARIOS (Admin, Concejal, Coordinadores)
    await pool.query(`
      CREATE TABLE usuarios (
        id SERIAL PRIMARY KEY,
        nombres VARCHAR(100) NOT NULL,
        apellidos VARCHAR(100) NOT NULL,
        tipo_documento VARCHAR(20) DEFAULT 'CC',
        numero_documento VARCHAR(20) UNIQUE NOT NULL,
        correo VARCHAR(100),
        celular VARCHAR(20),
        password VARCHAR(100) NOT NULL,
        rol VARCHAR(20) NOT NULL, 
        activo BOOLEAN DEFAULT TRUE
      );
    `);

    // 2. EQUIPO DE TRABAJO (Los que el Admin le asigna al Coordinador)
    // Ej: El empleado "Pedro" que trabaja para el Coordinador "Juan"
    await pool.query(`
      CREATE TABLE equipo_trabajo (
        id SERIAL PRIMARY KEY,
        nombre_completo VARCHAR(100) NOT NULL,
        cedula VARCHAR(20) NOT NULL,
        rol_equipo VARCHAR(50) NOT NULL, -- 'EMPLEADO', 'CONTRATISTA', 'LIDER_PROCESO'
        coordinador_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE
      );
    `);

    // 3. REFERIDOS (Votantes)
    await pool.query(`
      CREATE TABLE referidos (
        id SERIAL PRIMARY KEY,
        nombre_completo VARCHAR(150) NOT NULL,
        tipo_documento VARCHAR(20) DEFAULT 'CC',
        numero_documento VARCHAR(20) UNIQUE NOT NULL,
        mesa_votacion VARCHAR(10),
        celular VARCHAR(20),
        estado_voto BOOLEAN DEFAULT FALSE,
        observaciones TEXT,
        responsable_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE, -- El Coordinador dueño
        equipo_id INTEGER REFERENCES equipo_trabajo(id) -- Quién lo trajo realmente (El empleado)
      );
    `);

    // 4. INTENTOS FALLIDOS (Auditoría)
    await pool.query(`
      CREATE TABLE intentos_fallidos (
        id SERIAL PRIMARY KEY,
        numero_documento VARCHAR(20),
        usuario_intento_id INTEGER,
        fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        motivo VARCHAR(100) DEFAULT 'DUPLICIDAD',
        datos_json TEXT
      );
    `);

    // ADMIN DEFAULT
    await pool.query(`
      INSERT INTO usuarios (nombres, apellidos, numero_documento, password, rol) 
      VALUES ('Admin', 'General', 'admin', 'admin2026', 'ADMIN');
    `);

    res.send("✅ (JA12) SISTEMA JERÁRQUICO INSTALADO: Admin -> Coordinador -> Equipo -> Votante.");
  } catch (err) {
    console.error(err);
    res.send("❌ ERROR: " + err.message);
  }
});

// --- LOGIN ---
app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM usuarios WHERE numero_documento = $1 AND password = $2', [usuario, password]);
    if (result.rows.length > 0) res.json({ exito: true, usuario: result.rows[0] });
    else res.status(401).json({ exito: false, mensaje: 'Credenciales inválidas' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- GESTIÓN DE USUARIOS (CRUD COMPLETO) ---
app.get('/api/usuarios', async (req, res) => {
  const result = await pool.query('SELECT * FROM usuarios ORDER BY id DESC');
  res.json(result.rows);
});

app.post('/api/usuarios', async (req, res) => {
  const { nombres, apellidos, tipo_doc, num_doc, correo, celular, password, rol } = req.body;
  try {
    const r = await pool.query(`
      INSERT INTO usuarios (nombres, apellidos, tipo_documento, numero_documento, correo, celular, password, rol)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
    `, [nombres, apellidos, tipo_doc, num_doc, correo, celular, password, rol]);
    res.json({ exito: true, id: r.rows[0].id });
  } catch (err) { res.json({ exito: false, error: err.message }); }
});

app.put('/api/usuarios/:id', async (req, res) => { // EDITAR
  const { id } = req.params;
  const { nombres, apellidos, celular, password } = req.body;
  try {
    await pool.query('UPDATE usuarios SET nombres=$1, apellidos=$2, celular=$3, password=$4 WHERE id=$5', 
    [nombres, apellidos, celular, password, id]);
    res.json({ exito: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/usuarios/:id', async (req, res) => { // ELIMINAR
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    res.json({ exito: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- GESTIÓN DE EQUIPO (SUB-USUARIOS) ---
app.post('/api/equipo', async (req, res) => {
  const { nombre, cedula, rol, coordinador_id } = req.body;
  try {
    await pool.query('INSERT INTO equipo_trabajo (nombre_completo, cedula, rol_equipo, coordinador_id) VALUES ($1, $2, $3, $4)', 
    [nombre, cedula, rol, coordinador_id]);
    res.json({ exito: true });
  } catch (err) { res.json({ exito: false, error: err.message }); }
});

app.get('/api/equipo/:coordinador_id', async (req, res) => {
  const { coordinador_id } = req.params;
  const result = await pool.query('SELECT * FROM equipo_trabajo WHERE coordinador_id = $1', [coordinador_id]);
  res.json(result.rows);
});

app.delete('/api/equipo/:id', async (req, res) => {
  await pool.query('DELETE FROM equipo_trabajo WHERE id = $1', [req.params.id]);
  res.json({ exito: true });
});

// --- REGISTRO VOTANTES (Validación Duplicados) ---
app.post('/api/crear_referido', async (req, res) => {
  const { nombre, tipo_doc, num_doc, mesa, celular, observaciones, responsable_id, equipo_id } = req.body;
  
  try {
    // Verificar duplicidad
    const check = await pool.query('SELECT * FROM referidos WHERE numero_documento = $1', [num_doc]);
    
    if (check.rows.length > 0) {
      // Guardar Fallido
      const datosIntento = JSON.stringify(req.body);
      await pool.query(`INSERT INTO intentos_fallidos (numero_documento, usuario_intento_id, motivo, datos_json) VALUES ($1, $2, 'DUPLICIDAD', $3)`, [num_doc, responsable_id, datosIntento]);
      return res.json({ exito: false, mensaje: '⚠️ CÉDULA DUPLICADA. Intento registrado.' });
    }

    // Guardar Exitoso
    await pool.query(`
      INSERT INTO referidos (nombre_completo, tipo_documento, numero_documento, mesa_votacion, celular, observaciones, responsable_id, equipo_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [nombre, tipo_doc, num_doc, mesa, celular, observaciones, responsable_id, equipo_id || null]);

    res.json({ exito: true, mensaje: 'Votante registrado correctamente.' });
  } catch (err) { res.status(500).json({ exito: false, error: err.message }); }
});

// --- REPORTES Y DÍA D ---
app.get('/api/referidos/mis_registros/:id', async (req, res) => {
  const { id } = req.params;
  // Trae también el nombre del miembro del equipo que lo trajo
  const result = await pool.query(`
    SELECT r.*, e.nombre_completo as nombre_equipo, e.rol_equipo 
    FROM referidos r 
    LEFT JOIN equipo_trabajo e ON r.equipo_id = e.id 
    WHERE r.responsable_id = $1 ORDER BY r.id DESC`, [id]);
  res.json(result.rows);
});

// MARCAR VOTO (DÍA D)
app.put('/api/referidos/votar/:cedula', async (req, res) => {
  const { cedula } = req.params;
  await pool.query('UPDATE referidos SET estado_voto = true WHERE numero_documento = $1', [cedula]);
  res.json({ exito: true });
});

app.get('/api/dashboard/stats', async (req, res) => {
  const total = await pool.query('SELECT COUNT(*) FROM referidos');
  const votos = await pool.query('SELECT COUNT(*) FROM referidos WHERE estado_voto = true');
  res.json({ total: total.rows[0].count, votos: votos.rows[0].count });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`(JA12) Servidor v2 corriendo en puerto ${PORT}`);
});
