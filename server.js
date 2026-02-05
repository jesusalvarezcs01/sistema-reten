const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// CONEXIÓN A LA BASE DE DATOS
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- RUTA SECRETA PARA CREAR LAS TABLAS (SOLO SE USA UNA VEZ) ---
app.get('/setup', async (req, res) => {
  try {
    // Crear tabla de Usuarios
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100),
        rol VARCHAR(20),
        password VARCHAR(50)
      );
    `);
    
    // Crear tabla de Referidos (Votantes)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS referidos (
        id SERIAL PRIMARY KEY,
        cedula VARCHAR(20) UNIQUE NOT NULL,
        nombre VARCHAR(100),
        mesa_votacion VARCHAR(10),
        voto BOOLEAN DEFAULT FALSE,
        fecha_voto TIMESTAMP,
        origen VARCHAR(20),
        id_responsable INTEGER
      );
    `);

    // Insertar un usuario de prueba (si no existe)
    await pool.query(`
      INSERT INTO usuarios (nombre, rol, password) 
      VALUES ('Jefe Planeacion', 'ADMIN', 'admin123')
      ON CONFLICT DO NOTHING;
    `);

    res.send("✅ ¡ÉXITO! Las tablas (Memoria) han sido creadas. Ya puedes usar el sistema.");
  } catch (err) {
    console.error(err);
    res.send("❌ ERROR: " + err.message);
  }
});

// --- RUTA 1: VERIFICAR CÉDULA ---
app.get('/api/verificar/:cedula', async (req, res) => {
  const { cedula } = req.params;
  try {
    const result = await pool.query('SELECT * FROM referidos WHERE cedula = $1', [cedula]);
    if (result.rows.length === 0) {
      return res.json({ estado: 'NUEVO', mensaje: 'Votante no registrado' });
    }
    const referido = result.rows[0];
    if (referido.voto) {
        return res.json({ estado: 'YA_VOTO', datos: referido });
    }
    return res.json({ estado: 'REGISTRADO', datos: referido });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// --- RUTA 2: REGISTRAR VOTO ---
app.post('/api/votar', async (req, res) => {
  const { cedula } = req.body;
  try {
    const fecha = new Date();
    await pool.query('UPDATE referidos SET voto = true, fecha_voto = $1 WHERE cedula = $2', [fecha, cedula]);
    res.json({ exito: true, mensaje: 'Voto registrado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar voto' });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando en puerto ${PORT}`);
});
