const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ==========================================
// 1. PANTALLAS VISUALES (HTML EN EL SERVIDOR)
// ==========================================

// PANTALLA A: ESCÁNER PARA CELULAR
const HTML_ESCANER = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Escáner El Retén</title>
    <script src="https://unpkg.com/html5-qrcode" type="text/javascript"></script>
    <style>
        body { font-family: sans-serif; text-align: center; background: #111; color: white; margin: 0; }
        #reader { width: 100%; max-width: 500px; margin: auto; border-bottom: 2px solid #0099ff; }
        .res-box { padding: 20px; background: white; color: black; border-radius: 20px 20px 0 0; position: fixed; bottom: 0; width: 100%; display: none; }
        button { width: 100%; padding: 15px; font-size: 1rem; margin-top: 10px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; }
        .btn-blue { background: #004aad; color: white; }
        .btn-red { background: #dc3545; color: white; }
    </style>
</head>
<body>
    <h3 style="margin:10px;">📷 Lector de Cédulas</h3>
    <div id="reader"></div>
    <div id="resultado" class="res-box">
        <h3>Cédula Detectada:</h3>
        <input type="text" id="cedula-leida" style="font-size:1.5rem; width:100%; text-align:center; margin-bottom:10px;" readonly>
        <button class="btn-blue" onclick="verificar()">🔍 VERIFICAR ESTADO</button>
        <button class="btn-red" onclick="reiniciar()">🔄 ESCANEAR OTRA</button>
    </div>
    <script>
        let scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
        scanner.render(onScanSuccess);

        function onScanSuccess(decodedText) {
            scanner.clear();
            document.getElementById('resultado').style.display = 'block';
            // Limpieza básica por si lee PDF417 basura
            let cedulaLimpia = decodedText.replace(/[^0-9]/g, ''); 
            // Si es muy largo (PDF417 completo), tratamos de extraer la cédula (lógica simple)
            if(cedulaLimpia.length > 15) {
                // Esto es un parche temporal, el PDF417 es complejo. 
                // Asumimos que la cédula está en los primeros dígitos o pedimos digitar.
                alert("Código complejo detectado. Por favor verifique el número.");
            }
            document.getElementById('cedula-leida').value = cedulaLimpia || decodedText;
            navigator.vibrate(200);
        }

        async function verificar() {
            const ced = document.getElementById('cedula-leida').value;
            alert("Consultando: " + ced + " (Aquí conectaremos con la BD en el siguiente paso)");
            // Aquí iría el fetch al API
        }

        function reiniciar() { location.reload(); }
    </script>
</body>
</html>
`;

// RUTA PARA VER EL ESCÁNER
app.get('/escaner', (req, res) => {
    res.send(HTML_ESCANER);
});

// ==========================================
// 2. BACKEND Y LOGICA DE NEGOCIO (JA12)
// ==========================================

// --- INSTALACIÓN MAESTRA ---
app.get('/setup_master_v2', async (req, res) => {
  try {
    await pool.query('DROP TABLE IF EXISTS intentos_fallidos;');
    await pool.query('DROP TABLE IF EXISTS referidos;');
    await pool.query('DROP TABLE IF EXISTS equipo_trabajo;');
    await pool.query('DROP TABLE IF EXISTS usuarios;');
    
    // 1. USUARIOS
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

    // 2. EQUIPO
    await pool.query(`
      CREATE TABLE equipo_trabajo (
        id SERIAL PRIMARY KEY,
        nombre_completo VARCHAR(100) NOT NULL,
        cedula VARCHAR(20) NOT NULL,
        rol_equipo VARCHAR(50) NOT NULL,
        coordinador_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE
      );
    `);

    // 3. REFERIDOS
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
        responsable_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
        equipo_id INTEGER REFERENCES equipo_trabajo(id)
      );
    `);

    // 4. FALLIDOS
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

    res.send("✅ SISTEMA LISTO Y REINICIADO (V2)");
  } catch (err) { res.send("❌ ERROR: " + err.message); }
});

// --- API LOGIN ---
app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM usuarios WHERE numero_documento = $1 AND password = $2', [usuario, password]);
    if (result.rows.length > 0) res.json({ exito: true, usuario: result.rows[0] });
    else res.status(401).json({ exito: false, mensaje: 'Credenciales inválidas' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- API USUARIOS ---
app.get('/api/usuarios', async (req, res) => {
  const result = await pool.query('SELECT * FROM usuarios ORDER BY id DESC');
  res.json(result.rows);
});

app.post('/api/usuarios', async (req, res) => {
  const { nombres, apellidos, tipo_doc, num_doc, correo, celular, password, rol } = req.body;
  try {
    await pool.query(`INSERT INTO usuarios (nombres, apellidos, tipo_documento, numero_documento, correo, celular, password, rol) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [nombres, apellidos, tipo_doc, num_doc, correo, celular, password, rol]);
    res.json({ exito: true });
  } catch (err) { res.json({ exito: false, error: err.message }); }
});

app.delete('/api/usuarios/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    res.json({ exito: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- API EQUIPO ---
app.post('/api/equipo', async (req, res) => {
  const { nombre, cedula, rol, coordinador_id } = req.body;
  try {
    await pool.query('INSERT INTO equipo_trabajo (nombre_completo, cedula, rol_equipo, coordinador_id) VALUES ($1, $2, $3, $4)', [nombre, cedula, rol, coordinador_id]);
    res.json({ exito: true });
  } catch (err) { res.json({ exito: false, error: err.message }); }
});

app.get('/api/equipo/:coordinador_id', async (req, res) => {
  const result = await pool.query('SELECT * FROM equipo_trabajo WHERE coordinador_id = $1', [req.params.coordinador_id]);
  res.json(result.rows);
});

app.delete('/api/equipo/:id', async (req, res) => {
  await pool.query('DELETE FROM equipo_trabajo WHERE id = $1', [req.params.id]);
  res.json({ exito: true });
});

// --- API REFERIDOS ---
app.post('/api/crear_referido', async (req, res) => {
  const { nombre, tipo_doc, num_doc, mesa, celular, observaciones, responsable_id, equipo_id } = req.body;
  try {
    const check = await pool.query('SELECT * FROM referidos WHERE numero_documento = $1', [num_doc]);
    if (check.rows.length > 0) {
        const datosIntento = JSON.stringify(req.body);
        await pool.query(`INSERT INTO intentos_fallidos (numero_documento, usuario_intento_id, motivo, datos_json) VALUES ($1, $2, 'DUPLICIDAD', $3)`, [num_doc, responsable_id, datosIntento]);
        return res.json({ exito: false, mensaje: '⚠️ CÉDULA DUPLICADA.' });
    }
    await pool.query(`INSERT INTO referidos (nombre_completo, tipo_documento, numero_documento, mesa_votacion, celular, observaciones, responsable_id, equipo_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [nombre, tipo_doc, num_doc, mesa, celular, observaciones, responsable_id, equipo_id || null]);
    res.json({ exito: true, mensaje: 'Votante registrado.' });
  } catch (err) { res.status(500).json({ exito: false, error: err.message }); }
});

app.get('/api/referidos/mis_registros/:id', async (req, res) => {
  const result = await pool.query(`SELECT r.*, e.nombre_completo as nombre_equipo FROM referidos r LEFT JOIN equipo_trabajo e ON r.equipo_id = e.id WHERE r.responsable_id = $1 ORDER BY r.id DESC`, [req.params.id]);
  res.json(result.rows);
});

// --- API DASHBOARD ---
app.get('/api/dashboard/stats', async (req, res) => {
  const total = await pool.query('SELECT COUNT(*) FROM referidos');
  const votos = await pool.query('SELECT COUNT(*) FROM referidos WHERE estado_voto = true');
  res.json({ total: total.rows[0].count, votos: votos.rows[0].count });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`(JA12) Servidor LIVE en puerto ${PORT}`);
});
