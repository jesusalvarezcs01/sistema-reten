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

// --- RUTA DE ARQUITECTURA SEGÚN PDF ---
app.get('/setup_pdf', async (req, res) => {
  try {
    await pool.query('DROP TABLE IF EXISTS referidos;');
    await pool.query('DROP TABLE IF EXISTS usuarios;');
    
    // 1. Tabla de USUARIOS (Req 2.1 del PDF)
    await pool.query(`
      CREATE TABLE usuarios (
        id SERIAL PRIMARY KEY,
        nombres VARCHAR(100),
        apellidos VARCHAR(100),
        tipo_documento VARCHAR(20),
        numero_documento VARCHAR(20) UNIQUE NOT NULL,
        correo VARCHAR(100),
        celular VARCHAR(20),
        password VARCHAR(100), -- Debe ser hash en prod, texto plano por ahora
        rol VARCHAR(20) NOT NULL -- 'ADMIN', 'CONCEJAL', 'COORDINADOR'
      );
    `);

    // 2. Tabla de REFERIDOS (Req 2.2 del PDF)
    await pool.query(`
      CREATE TABLE referidos (
        id SERIAL PRIMARY KEY,
        nombre_completo VARCHAR(150),
        tipo_documento VARCHAR(20),
        numero_documento VARCHAR(20) UNIQUE NOT NULL,
        mesa_votacion VARCHAR(10),
        celular VARCHAR(20),
        estado_voto BOOLEAN DEFAULT FALSE, -- Req: Valor por defecto false
        observaciones TEXT,
        responsable_id INTEGER REFERENCES usuarios(id) -- Asociación obligatoria
      );
    `);

    // --- USUARIOS BASE ---
    // ADMIN (Tú)
    await pool.query(`INSERT INTO usuarios (nombres, numero_documento, password, rol) 
      VALUES ('Administrador', 'admin', 'admin2026', 'ADMIN');`);
    
    // CONCEJAL (Usuario de prueba)
    await pool.query(`INSERT INTO usuarios (nombres, numero_documento, password, rol) 
      VALUES ('Candidato', 'concejal', 'victoria2026', 'CONCEJAL');`);
    
    // COORDINADOR (Usuario de prueba)
    await pool.query(`INSERT INTO usuarios (nombres, numero_documento, password, rol) 
      VALUES ('Lider Zona 1', 'lider1', 'lider123', 'COORDINADOR');`);

    res.send("✅ REQUERIMIENTOS PDF APLICADOS: Tablas con campos exactos creadas.");
  } catch (err) {
    console.error(err);
    res.send("❌ ERROR: " + err.message);
  }
});

// --- LOGIN ---
app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;
  // En el PDF el usuario es el número de documento
  const result = await pool.query('SELECT * FROM usuarios WHERE numero_documento = $1 AND password = $2', [usuario, password]);
  
  if (result.rows.length > 0) {
    res.json({ exito: true, usuario: result.rows[0] });
  } else {
    res.status(401).json({ exito: false, mensaje: 'Credenciales incorrectas' });
  }
});

// --- API: CREAR REFERIDO (Función de Coordinador) ---
app.post('/api/crear_referido', async (req, res) => {
  const { nombre, tipo_doc, num_doc, mesa, celular, observaciones, responsable_id } = req.body;
  try {
    await pool.query(`
      INSERT INTO referidos (nombre_completo, tipo_documento, numero_documento, mesa_votacion, celular, observaciones, responsable_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [nombre, tipo_doc, num_doc, mesa, celular, observaciones, responsable_id]);
    res.json({ exito: true, mensaje: 'Referido guardado correctamente' });
  } catch (err) {
    res.status(500).json({ exito: false, error: err.message });
  }
});

// --- API: MIS REFERIDOS (Para Coordinador) ---
app.get('/api/mis_referidos/:id', async (req, res) => {
  const { id } = req.params;
  const result = await pool.query('SELECT * FROM referidos WHERE responsable_id = $1', [id]);
  res.json(result.rows);
});

// --- API: TOTALES (Para Admin y Concejal) ---
app.get('/api/dashboard/totales', async (req, res) => {
  const total = await pool.query('SELECT COUNT(*) FROM referidos');
  const votos = await pool.query('SELECT COUNT(*) FROM referidos WHERE estado_voto = true');
  res.json({ total: total.rows[0].count, votos: votos.rows[0].count });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor listo en puerto ${PORT}`);
});
