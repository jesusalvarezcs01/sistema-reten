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

// --- RUTA MAESTRA DE INSTALACIÓN (PDF COMPLETO) ---
app.get('/setup_master', async (req, res) => {
  try {
    // Borrar versiones anteriores para garantizar estructura PDF
    await pool.query('DROP TABLE IF EXISTS intentos_fallidos;');
    await pool.query('DROP TABLE IF EXISTS referidos;');
    await pool.query('DROP TABLE IF EXISTS usuarios;');
    
    // 1. TABLA USUARIOS (Req 2.1)
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
        rol VARCHAR(20) NOT NULL, -- ADMIN, CONCEJAL, COORDINADOR
        activo BOOLEAN DEFAULT TRUE
      );
    `);

    // 2. TABLA REFERIDOS (Req 2.2)
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
        responsable_id INTEGER REFERENCES usuarios(id),
        -- Campos para "Usuarios dependientes" (Req 1.1)
        tipo_vinculacion VARCHAR(50), -- 'DIRECTO', 'EMPLEADO', 'CONTRATISTA', 'LIDER_PROCESO'
        nombre_vinculado VARCHAR(100) -- El nombre del empleado/contratista si aplica
      );
    `);

    // 3. TABLA INTENTOS FALLIDOS (Req 2.3)
    await pool.query(`
      CREATE TABLE intentos_fallidos (
        id SERIAL PRIMARY KEY,
        numero_documento VARCHAR(20),
        usuario_intento_id INTEGER,
        fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        motivo VARCHAR(100) DEFAULT 'DUPLICIDAD',
        datos_json TEXT -- Guardamos el intento completo como evidencia
      );
    `);

    // USUARIO ADMINISTRADOR POR DEFECTO
    await pool.query(`
      INSERT INTO usuarios (nombres, apellidos, numero_documento, password, rol) 
      VALUES ('Administrador', 'Sistema', 'admin', 'admin2026', 'ADMIN');
    `);

    res.send("✅ (JA12) SISTEMA MAESTRO INSTALADO: Tablas de Usuarios, Referidos y Auditoría de Duplicados listas.");
  } catch (err) {
    console.error(err);
    res.send("❌ ERROR CRÍTICO: " + err.message);
  }
});

// --- LOGIN ---
app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM usuarios WHERE numero_documento = $1 AND password = $2 AND activo = true', [usuario, password]);
    if (result.rows.length > 0) {
      res.json({ exito: true, usuario: result.rows[0] });
    } else {
      res.status(401).json({ exito: false, mensaje: 'Credenciales inválidas o usuario inactivo.' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- GESTIÓN DE USUARIOS (SOLO ADMIN) ---
app.get('/api/usuarios', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM usuarios ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/usuarios', async (req, res) => {
  const { nombres, apellidos, tipo_doc, num_doc, correo, celular, password, rol } = req.body;
  try {
    await pool.query(`
      INSERT INTO usuarios (nombres, apellidos, tipo_documento, numero_documento, correo, celular, password, rol)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [nombres, apellidos, tipo_doc, num_doc, correo, celular, password, rol]);
    res.json({ exito: true, mensaje: 'Usuario creado' });
  } catch (err) { res.status(500).json({ exito: false, error: err.message }); }
});

app.put('/api/usuarios/:id/estado', async (req, res) => {
  const { id } = req.params;
  const { activo } = req.body;
  try {
    await pool.query('UPDATE usuarios SET activo = $1 WHERE id = $2', [activo, id]);
    res.json({ exito: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- REGISTRO DE REFERIDOS (CON LÓGICA DE DUPLICADOS REQ 2.3) ---
app.post('/api/crear_referido', async (req, res) => {
  const { nombre, tipo_doc, num_doc, mesa, celular, observaciones, responsable_id, tipo_vinc, nombre_vinc } = req.body;
  
  try {
    // 1. Verificar duplicidad antes de insertar
    const check = await pool.query('SELECT * FROM referidos WHERE numero_documento = $1', [num_doc]);
    
    if (check.rows.length > 0) {
      // 2. SI EXISTE: Registrar en tabla de fallidos (Req 2.3)
      const datosIntento = JSON.stringify(req.body);
      await pool.query(`
        INSERT INTO intentos_fallidos (numero_documento, usuario_intento_id, motivo, datos_json)
        VALUES ($1, $2, 'DUPLICIDAD', $3)
      `, [num_doc, responsable_id, datosIntento]);
      
      return res.json({ exito: false, mensaje: 'DUPLICADO: Esta cédula ya existe. El intento ha sido auditado.' });
    }

    // 3. SI NO EXISTE: Crear registro
    await pool.query(`
      INSERT INTO referidos (nombre_completo, tipo_documento, numero_documento, mesa_votacion, celular, observaciones, responsable_id, tipo_vinculacion, nombre_vinculado)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [nombre, tipo_doc, num_doc, mesa, celular, observaciones, responsable_id, tipo_vinc, nombre_vinc]);

    res.json({ exito: true, mensaje: 'Referido registrado exitosamente.' });

  } catch (err) {
    res.status(500).json({ exito: false, error: err.message });
  }
});

// --- REPORTES Y LISTADOS ---
app.get('/api/referidos/todos', async (req, res) => {
  // Para ADMIN: Ve todo + Nombre del Responsable
  const result = await pool.query(`
    SELECT r.*, u.nombres as nom_resp, u.apellidos as ape_resp 
    FROM referidos r
    JOIN usuarios u ON r.responsable_id = u.id
    ORDER BY r.id DESC
  `);
  res.json(result.rows);
});

app.get('/api/referidos/mis_registros/:id', async (req, res) => {
  // Para COORDINADOR: Ve solo lo suyo
  const { id } = req.params;
  const result = await pool.query('SELECT * FROM referidos WHERE responsable_id = $1 ORDER BY id DESC', [id]);
  res.json(result.rows);
});

app.get('/api/dashboard/stats', async (req, res) => {
  const total = await pool.query('SELECT COUNT(*) FROM referidos');
  const votos = await pool.query('SELECT COUNT(*) FROM referidos WHERE estado_voto = true');
  const fallidos = await pool.query('SELECT COUNT(*) FROM intentos_fallidos');
  res.json({ 
    total: total.rows[0].count, 
    votos: votos.rows[0].count,
    fallidos: fallidos.rows[0].count 
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`(JA12) Servidor COMPLETO corriendo en puerto ${PORT}`);
});
