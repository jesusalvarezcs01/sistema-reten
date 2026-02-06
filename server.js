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

// --- RUTA DE ARQUITECTURA (ROLES Y PERMISOS DEFINITIVOS) ---
app.get('/setup_final', async (req, res) => {
  try {
    // 1. Limpieza total (Borramos para reconstruir bien)
    await pool.query('DROP TABLE IF EXISTS referidos;');
    await pool.query('DROP TABLE IF EXISTS usuarios;');
    
    // 2. Tabla de USUARIOS (Aquí defines quién es Admin, Concejal o Coordinador)
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

    // 3. Tabla de REFERIDOS (Votantes)
    // Se vincula al 'coordinador_id' para saber quién trajo el voto
    await pool.query(`
      CREATE TABLE referidos (
        id SERIAL PRIMARY KEY,
        cedula VARCHAR(20) UNIQUE NOT NULL,
        nombre VARCHAR(100),
        mesa_votacion VARCHAR(10),
        telefono VARCHAR(20),
        voto BOOLEAN DEFAULT FALSE,
        coordinador_id INTEGER REFERENCES usuarios(id)
      );
    `);

    // --- CREACIÓN DE USUARIOS BASE ---

    // 1. EL ADMINISTRADOR (TÚ) - Control Total
    await pool.query(`INSERT INTO usuarios (usuario, password, nombre_completo, rol) 
      VALUES ('admin', 'admin2026', 'Administrador del Sistema', 'ADMIN');`);
    
    // 2. EL CONCEJAL (Solo Vista)
    await pool.query(`INSERT INTO usuarios (usuario, password, nombre_completo, rol) 
      VALUES ('concejal', 'victoria2026', 'H.C. Candidato', 'CONCEJAL');`);
    
    // 3. UN COORDINADOR DE EJEMPLO (Trabajo de Campo)
    await pool.query(`INSERT INTO usuarios (usuario, password, nombre_completo, rol) 
      VALUES ('lider1', 'lider123', 'Coordinador Zona 1', 'COORDINADOR');`);

    res.send("✅ ESTRUCTURA CORRECTA: Administrador, Concejal y Coordinadores creados.");
  } catch (err) {
    console.error(err);
    res.send("❌ ERROR: " + err.message);
  }
});

// --- LOGIN (IDENTIFICADOR DE ROLES) ---
app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;
  const result = await pool.query('SELECT * FROM usuarios WHERE usuario = $1 AND password = $2', [usuario, password]);
  
  if (result.rows.length > 0) {
    res.json({ exito: true, usuario: result.rows[0] });
  } else {
    res.status(401).json({ exito: false, mensaje: 'Credenciales incorrectas' });
  }
});

// --- API: CONTEO GENERAL (Para Admin y Concejal) ---
app.get('/api/admin/estadisticas', async (req, res) => {
  const total = await pool.query('SELECT COUNT(*) FROM referidos');
  const votos = await pool.query('SELECT COUNT(*) FROM referidos WHERE voto = true');
  // Aquí podemos agregar más desglose por mesas después
  res.json({ total: total.rows[0].count, votos: votos.rows[0].count });
});

// --- API: VER REFERIDOS DE UN COORDINADOR ESPECÍFICO ---
app.get('/api/mis_referidos/:id_coordinador', async (req, res) => {
  const { id_coordinador } = req.params;
  const result = await pool.query('SELECT * FROM referidos WHERE coordinador_id = $1', [id_coordinador]);
  res.json(result.rows);
});

// --- API: ESCANEO GENERAL (Para ingreso en puerta) ---
app.get('/api/verificar/:cedula', async (req, res) => {
  const { cedula } = req.params;
  const result = await pool.query(`
    SELECT r.*, u.nombre_completo as nombre_coordinador 
    FROM referidos r 
    LEFT JOIN usuarios u ON r.coordinador_id = u.id 
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
