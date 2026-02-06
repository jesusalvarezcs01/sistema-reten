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

// --- RUTA DE REPARACIÓN Y SETUP ---
app.get('/setup', async (req, res) => {
  try {
    // 1. BORRAR la tabla vieja si existe (Para corregir el error de columnas)
    await pool.query('DROP TABLE IF EXISTS referidos;');
    
    // 2. CREAR la tabla nueva con las columnas correctas
    await pool.query(`
      CREATE TABLE referidos (
        id SERIAL PRIMARY KEY,
        cedula VARCHAR(20) UNIQUE NOT NULL,
        nombre VARCHAR(100),
        mesa_votacion VARCHAR(10),
        lider_cargo VARCHAR(100),
        voto BOOLEAN DEFAULT FALSE
      );
    `);

    // 3. Insertar a JUAN PÉREZ como prueba
    await pool.query(`
      INSERT INTO referidos (cedula, nombre, mesa_votacion, lider_cargo) 
      VALUES ('123456', 'Juan Pérez', 'Mesa 1', 'Líder de Prueba');
    `);

    res.send("✅ ¡ARREGLADO! Tabla reconstruida y Juan Pérez agregado.");
  } catch (err) {
    console.error(err);
    res.send("❌ ERROR: " + err.message);
  }
});

// --- VERIFICAR CÉDULA ---
app.get('/api/verificar/:cedula', async (req, res) => {
  const { cedula } = req.params;
  try {
    const result = await pool.query('SELECT * FROM referidos WHERE cedula = $1', [cedula]);
    if (result.rows.length === 0) {
      return res.json({ estado: 'NUEVO', mensaje: 'Votante no registrado' });
    }
    return res.json({ estado: 'REGISTRADO', datos: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor listo en puerto ${PORT}`);
});
