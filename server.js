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

// --- RUTA DE ARQUITECTURA (ROLES Y PERMISOS) ---
app.get('/setup_completo', async (req, res) => {
  try {
    // 1. Reiniciar tablas (Para aplicar la nueva estructura limpia)
    await pool.query('DROP TABLE IF EXISTS referidos;');
    await pool.query('DROP TABLE IF EXISTS usuarios;');
    
    // 2. Tabla de USUARIOS (Aquí están los Roles: Admin, Concejal, Coordinador)
    await pool.query(`
      CREATE TABLE usuarios (
        id SERIAL PRIMARY KEY,
        usuario VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(50) NOT NULL,
        nombre_completo VARCHAR(100),
        rol VARCHAR(20) NOT NULL, -- 'ADMIN', 'CONCEJAL', 'COORDINADOR'
        telefono VARCHAR(20)
      );
    `);

    // 3. Tabla de REFERIDOS (Votantes) vinculada a un Coordinador
    await pool.query(`
      CREATE TABLE referidos (
        id SERIAL PRIMARY KEY,
        cedula VARCHAR(20) UNIQUE NOT NULL,
        nombre VARCHAR(100),
        mesa_votacion VARCHAR(10),
        telefono VARCHAR(20),
        voto BOOLEAN DEFAULT FALSE,
        coordinador_id INTEGER REFERENCES usuarios(id) -- Vinculo con quien lo trajo
      );
    `);

    // 4. Crear los Usuarios Base (Segun tus roles)
    // ADMIN: Soporte Técnico
    await pool.query(`INSERT INTO usuarios (usuario, password, nombre_completo, rol) VALUES ('admin', 'admin2026', 'Soporte Técnico', 'ADMIN');`);
    
    // CONCEJAL: El Candidato (Tú)
    await pool.query(`INSERT INTO usuarios (usuario, password, nombre_completo, rol) VALUES ('concejal', 'victoria2026', 'H.C. Jesús Alvarez', 'CONCEJAL');`);
    
    // COORDINADOR DE EJEMPLO
    await pool.query(`INSERT INTO usuarios (usuario, password, nombre_completo, rol) VALUES ('lider1', 'lider123', 'Coordinador Zona Norte', 'COORDINADOR');`);

    res.send("✅ ARQUITECTURA ACTUALIZADA: Roles de Admin, Concejal y Coordinador creados.");
  } catch (err) {
    console.error(err);
    res.send("❌ ERROR: " + err.message);
  }
});

// --- API: LOGIN (Para entrar al sistema) ---
app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;
  const result = await pool.query('SELECT * FROM usuarios WHERE usuario = $1 AND password = $2', [usuario, password]);
  
  if (result.rows.length > 0) {
    res.json({ exito: true, usuario: result.rows[0] });
  } else {
    res.status(401).json({ exito: false, mensaje: 'Credenciales incorrectas' });
  }
});

// --- API: CONCEJAL (Ve el total general) ---
app.get('/api/dashboard/general', async (req, res) => {
  // Aquí agregaremos la lógica para que tú veas el total de votos vs meta
  const total = await pool.query('SELECT COUNT(*) FROM referidos');
  const votos = await pool.query('SELECT COUNT(*) FROM referidos WHERE voto = true');
  res.json({ total: total.rows[0].count, votos: votos.rows[0].count });
});

// --- API: COORDINADOR (Solo ve a SU gente) ---
app.get('/api/mis_referidos/:id_coordinador', async (req, res) => {
  const { id_coordinador } = req.params;
  const result = await pool.query('SELECT * FROM referidos WHERE coordinador_id = $1', [id_coordinador]);
  res.json(result.rows);
});

// --- API: VERIFICAR CÉDULA (Pública para escaner) ---
app.get('/api/verificar/:cedula', async (req, res) => {
  const { cedula } = req.params;
  const result = await pool.query(`
    SELECT r.*, u.nombre_completo as nombre_coordinador 
    FROM referidos r 
    JOIN usuarios u ON r.coordinador_id = u.id 
    WHERE r.cedula = $1
  `, [cedula]);

  if (result.rows.length === 0) {
    return res.json({ estado: 'NUEVO', mensaje: 'Votante no registrado' });
  }
  return res.json({ estado: 'REGISTRADO', datos: result.rows[0] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor listo en puerto ${PORT}`);
});
