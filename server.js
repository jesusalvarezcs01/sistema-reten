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

// =================================================================
// 1. INTERFAZ GRÁFICA CORREGIDA (CSS MÓVIL ROBUSTO)
// =================================================================
const APP_HTML = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Sistema Electoral El Retén</title>
    
    <script src="https://unpkg.com/@microblink/blinkid-in-browser-sdk@5.8.0/ui/dist/blinkid-in-browser/blinkid-in-browser.js"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    
    <style>
        :root { --primary: #003366; --bg: #f4f7f6; --white: #ffffff; --green: #28a745; --red: #dc3545; }
        
        body { 
            font-family: 'Segoe UI', sans-serif; 
            background-color: var(--bg); 
            margin: 0; 
            padding: 0; 
            user-select: none;
            overflow-x: hidden; /* Evita desplazamiento lateral */
        }
        
        /* HEADER FIJO */
        .navbar { 
            background: var(--primary); 
            color: white; 
            padding: 15px; 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            position: fixed; /* Fijo arriba */
            top: 0; left: 0; right: 0;
            z-index: 9999; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.2); 
            height: 60px;
            box-sizing: border-box;
        }

        /* CONTENEDOR PRINCIPAL (Para no quedar debajo del header) */
        .main-content {
            padding-top: 80px; /* Espacio para el header */
            padding-bottom: 20px;
            min-height: 100vh;
        }
        
        /* PANTALLAS (IMPORTANTE: display none por defecto) */
        .screen { 
            display: none !important; 
            width: 100%;
        }
        .screen.active { 
            display: block !important; 
            animation: fade 0.3s; 
        }
        
        /* TARJETAS */
        .card { 
            background: white; 
            border-radius: 12px; 
            padding: 20px; 
            margin: 0 auto 15px auto; 
            box-shadow: 0 2px 8px rgba(0,0,0,0.05); 
            width: 90%; 
            max-width: 500px;
        }

        /* ESCÁNER MICROBLINK (AJUSTE MÓVIL) */
        #screen-microblink {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: black;
            z-index: 10000; /* Por encima de todo */
            padding: 0;
        }

        blinkid-in-browser {
            width: 100%;
            height: 100%;
            display: block;
        }

        .btn-cancelar-scan {
            position: absolute; 
            top: 20px; left: 20px; 
            z-index: 10001; 
            background: white; 
            color: black; 
            border: none; 
            padding: 10px 20px; 
            border-radius: 20px;
            font-weight: bold;
            box-shadow: 0 2px 5px rgba(0,0,0,0.5);
        }

        /* ESTILOS GENERALES */
        .btn { width: 100%; padding: 15px; border: none; border-radius: 8px; font-size: 1rem; font-weight: bold; cursor: pointer; margin-top: 10px; color: white; }
        .btn-primary { background: var(--primary); }
        .btn-green { background: var(--green); }
        input, select { width: 100%; padding: 12px; margin-bottom: 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem; box-sizing: border-box; }

        /* MODAL */
        .result-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); display: none; align-items: center; justify-content: center; z-index: 20000; }
        .modal-box { background: white; width: 85%; max-width: 400px; padding: 20px; border-radius: 15px; text-align: center; }

        @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    </style>
</head>
<body>

    <script>
        // TU LLAVE DE RENDER
        const LICENCIA_MICROBLINK = "sRwCABpzaXN0ZW1hLXJldGVuLm9ucmVuZGVyLmNvbQZsZXlKRGNtVmhkR1ZrVDI0aU9qRTNOekF6TkRBNE56UXhORE1zSWtOeVpXRjBaV1JHYjNJaU9pSmhOVFkyT1RNeFppMWpNbVEyTFRRMk1UY3RZalF3T0MwM09Ea3dNVFJrT0RFMVpqQWlmUT09Xx8uagCPC8T3b3Qa3oHIoGgMBAgsat/gyX1+szaTbpLSxKbea+5LfnKoV2qjcJo5KX2BZfrFUBxFP093X0F3XpjecVfoJx+llc9E4c5k8MBT59V+d+ll6wtjn1EnjA=="; 
    </script>

    <div class="navbar" id="nav" style="display:none;">
        <div id="user-display" style="font-weight:bold;">Usuario</div>
        <div onclick="logout()" style="cursor:pointer; padding: 10px;"><i class="fas fa-sign-out-alt"></i> SALIR</div>
    </div>

    <div class="main-content">
        
        <div id="screen-login" class="screen active" style="padding-top: 50px;">
            <div class="card" style="text-align: center;">
                <h2 style="color: var(--primary);">CONTROL ELECTORAL</h2>
                <p>El Retén 2026</p>
                <br>
                <input type="number" id="login-user" placeholder="Cédula Usuario">
                <input type="password" id="login-pass" placeholder="Contraseña">
                <button class="btn btn-primary" onclick="login()">INGRESAR</button>
                <p id="error-msg" style="color:red; display:none; margin-top:10px;">Credenciales incorrectas</p>
            </div>
        </div>

        <div id="screen-dashboard" class="screen">
            <div class="card">
                <h3>👋 Hola, <span id="dash-name">...</span></h3>
                <button class="btn btn-primary" onclick="irA('screen-registro')">📝 REGISTRO MANUAL</button>
                <hr style="margin:20px 0; border-top:1px solid #eee;">
                <button class="btn btn-green" onclick="iniciarMicroblink()">📷 ESCÁNER DÍA D</button>
            </div>
            <div class="card">
                <div style="display:flex; justify-content:space-around;">
                    <div style="text-align:center;"><h2><span id="stat-total">0</span></h2><small>Total</small></div>
                    <div style="text-align:center; color:green;"><h2><span id="stat-votos">0</span></h2><small>Votaron</small></div>
                </div>
            </div>
        </div>

        <div id="screen-registro" class="screen">
            <button class="btn" style="background:#ccc; color:#333; width:auto; margin-bottom:10px;" onclick="irA('screen-dashboard')">⬅ Volver</button>
            <div class="card">
                <h3>Nuevo Votante</h3>
                <input type="text" id="reg-nombre" placeholder="Nombre">
                <input type="number" id="reg-cedula" placeholder="Cédula">
                <input type="tel" id="reg-cel" placeholder="Celular">
                <input type="text" id="reg-mesa" placeholder="Mesa">
                <label><b>Vinculado Por:</b></label>
                <select id="reg-equipo"><option>Cargando...</option></select>
                <button class="btn btn-primary" onclick="guardarRegistro()">GUARDAR</button>
            </div>
        </div>

    </div> <div id="screen-microblink" class="screen">
        <button class="btn-cancelar-scan" onclick="detenerMicroblink()">⬅ CANCELAR / VOLVER</button>
        <blinkid-in-browser
            id="my-blinkid-component"
            engine-location="https://unpkg.com/@microblink/blinkid-in-browser-sdk@5.8.0/resources/"
        ></blinkid-in-browser>
    </div>

    <div id="modal-result" class="result-modal" onclick="cerrarModal()">
        <div class="modal-box" id="modal-box-content"></div>
    </div>

    <script>
        const API = window.location.origin;
        let currentUser = null;

        // --- MICROBLINK LOGIC ---
        function iniciarMicroblink() {
            irA('screen-microblink');
            
            const blinkId = document.querySelector('blinkid-in-browser');
            blinkId.licenseKey = LICENCIA_MICROBLINK;
            blinkId.recognizers = ['BlinkIdRecognizer']; 

            // EVENTOS
            blinkId.addEventListener('scanSuccess', (ev) => {
                const results = ev.detail.recognizers.BlinkIdRecognizer;
                if (results.resultState === 'Valid') {
                    const docNumber = results.documentNumber || results.mrz.documentNumber || results.mrz.primaryId;
                    if(docNumber) {
                        let cedulaLimpia = docNumber.replace(/</g, '').replace(/[a-zA-Z]/g, '');
                        // DETENER MICROBLINK ANTES DE MOSTRAR RESULTADO PARA AHORRAR RECURSOS
                        procesarVoto(cedulaLimpia);
                        detenerMicroblink(); 
                    }
                }
            });

            blinkId.addEventListener('scanError', (ev) => {
                 if(ev.detail.code === "LicenseError") {
                    alert("Error de Licencia: Verifica el dominio.");
                    detenerMicroblink();
                 }
            });
        }

        function detenerMicroblink() {
            irA('screen-dashboard');
        }

        // --- APP LOGIC ---
        function irA(screenId) {
            // Ocultar todas
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            // Mostrar la deseada
            document.getElementById(screenId).classList.add('active');
            
            // Si es login, ocultar navbar
            if(screenId === 'screen-login') document.getElementById('nav').style.display = 'none';
            else document.getElementById('nav').style.display = 'flex';
        }

        function logout() { localStorage.removeItem('reten_user'); location.reload(); }

        async function login() {
            const u = document.getElementById('login-user').value;
            const p = document.getElementById('login-pass').value;
            try {
                const res = await fetch(\`\${API}/api/login\`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ usuario: u, password: p })
                });
                const data = await res.json();
                if(data.exito) {
                    currentUser = data.usuario;
                    irA('screen-dashboard');
                    document.getElementById('dash-name').innerText = currentUser.nombres;
                    cargarStats();
                    cargarEquipo();
                } else { document.getElementById('error-msg').style.display = 'block'; }
            } catch(e) { alert("Error conexión"); }
        }

        async function cargarStats() {
            const res = await fetch(\`\${API}/api/dashboard/stats\`);
            const data = await res.json();
            document.getElementById('stat-total').innerText = data.total;
            document.getElementById('stat-votos').innerText = data.votos;
        }

        async function cargarEquipo() {
            const res = await fetch(\`\${API}/api/equipo/\${currentUser.id}\`);
            const lista = await res.json();
            let html = '<option value="">DIRECTO (Yo mismo)</option>';
            lista.forEach(m => html += \`<option value="\${m.id}">\${m.nombre_completo} (\${m.rol_equipo})</option>\`);
            document.getElementById('reg-equipo').innerHTML = html;
        }

        async function guardarRegistro() {
            const data = {
                nombre: document.getElementById('reg-nombre').value,
                num_doc: document.getElementById('reg-cedula').value,
                celular: document.getElementById('reg-cel').value,
                mesa: document.getElementById('reg-mesa').value,
                responsable_id: currentUser.id,
                equipo_id: document.getElementById('reg-equipo').value || null
            };
            const res = await fetch(\`\${API}/api/crear_referido\`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            const resp = await res.json();
            if(resp.exito) { alert("✅ Guardado"); document.getElementById('reg-cedula').value = ""; cargarStats(); }
            else { alert(resp.mensaje); }
        }

        async function procesarVoto(cedula) {
            mostrarModal('loading', 'Consultando...', 'Verificando ' + cedula);
            try {
                const resCheck = await fetch(\`\${API}/api/verificar/\${cedula}\`);
                const dataCheck = await resCheck.json();
                
                if(dataCheck.estado === 'NUEVO') {
                    mostrarModal('error', 'NO REGISTRADO', \`Cédula <b>\${cedula}</b> no encontrada.\`);
                } else if (dataCheck.estado === 'YA_VOTO') {
                    mostrarModal('warning', 'YA VOTÓ', \`Ya sufragó.<br>Líder: \${dataCheck.datos.nombre_coordinador}\`);
                } else {
                    await fetch(\`\${API}/api/referidos/votar/\${cedula}\`, { method: 'PUT' });
                    mostrarModal('success', '✅ VOTO EXITOSO', \`\${dataCheck.datos.nombre_completo}<br>Mesa: \${dataCheck.datos.mesa_votacion}\`);
                    cargarStats();
                }
            } catch(e) { mostrarModal('error', 'Error', 'Fallo de red'); }
        }

        function mostrarModal(tipo, titulo, mensaje) {
            const box = document.getElementById('modal-box-content');
            let icon = 'fa-spinner fa-spin'; let color = '#666';
            if(tipo === 'success') { icon = 'fa-check-circle'; color = 'var(--green)'; }
            if(tipo === 'error') { icon = 'fa-times-circle'; color = 'var(--red)'; }
            if(tipo === 'warning') { icon = 'fa-exclamation-triangle'; color = '#ffc107'; }
            
            box.innerHTML = \`
                <i class="fas \${icon}" style="font-size:3rem; color:\${color}; margin-bottom:10px;"></i>
                <h2 style="color:\${color}; margin:5px 0;">\${titulo}</h2>
                <p style="font-size:1.1rem; color:#333;">\${mensaje}</p>
                \${tipo !== 'loading' ? '<button class="btn btn-primary" onclick="cerrarModal()">ACEPTAR</button>' : ''}
            \`;
            document.getElementById('modal-result').style.display = 'flex';
        }

        function cerrarModal() { document.getElementById('modal-result').style.display = 'none'; }
    </script>
</body>
</html>
`;

// =================================================================
// 2. BACKEND (SERVIDOR Y BASE DE DATOS)
// =================================================================
app.get('/', (req, res) => { res.send(APP_HTML); });

// API LOGIN
app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const r = await pool.query('SELECT * FROM usuarios WHERE numero_documento = $1 AND password = $2', [usuario, password]);
    if (r.rows.length > 0) res.json({ exito: true, usuario: r.rows[0] });
    else res.json({ exito: false });
  } catch (err) { res.status(500).send(err); }
});

// SETUP MAESTRO
app.get('/setup_master_v3', async (req, res) => {
  try {
    await pool.query('DROP TABLE IF EXISTS intentos_fallidos;');
    await pool.query('DROP TABLE IF EXISTS referidos;');
    await pool.query('DROP TABLE IF EXISTS equipo_trabajo;');
    await pool.query('DROP TABLE IF EXISTS usuarios;');
    
    await pool.query(`CREATE TABLE usuarios (id SERIAL PRIMARY KEY, nombres VARCHAR(100), apellidos VARCHAR(100), numero_documento VARCHAR(20) UNIQUE NOT NULL, password VARCHAR(100), rol VARCHAR(20), activo BOOLEAN DEFAULT TRUE);`);
    await pool.query(`CREATE TABLE equipo_trabajo (id SERIAL PRIMARY KEY, nombre_completo VARCHAR(100), cedula VARCHAR(20), rol_equipo VARCHAR(50), coordinador_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE);`);
    await pool.query(`CREATE TABLE referidos (id SERIAL PRIMARY KEY, nombre_completo VARCHAR(150), tipo_documento VARCHAR(20), numero_documento VARCHAR(20) UNIQUE NOT NULL, mesa_votacion VARCHAR(10), celular VARCHAR(20), estado_voto BOOLEAN DEFAULT FALSE, observaciones TEXT, responsable_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE, equipo_id INTEGER REFERENCES equipo_trabajo(id));`);
    await pool.query(`CREATE TABLE intentos_fallidos (id SERIAL PRIMARY KEY, numero_documento VARCHAR(20), usuario_intento_id INTEGER, fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP, motivo VARCHAR(100), datos_json TEXT);`);

    await pool.query(`INSERT INTO usuarios (nombres, apellidos, numero_documento, password, rol) VALUES ('Admin', 'General', 'admin', 'admin2026', 'ADMIN');`);
    res.send("✅ SISTEMA V3 CON MICROBLINK LISTO.");
  } catch (err) { res.send("❌ ERROR: " + err.message); }
});

// API ENDPOINTS
app.get('/api/dashboard/stats', async (req, res) => {
  const t = await pool.query('SELECT COUNT(*) FROM referidos');
  const v = await pool.query('SELECT COUNT(*) FROM referidos WHERE estado_voto = true');
  res.json({ total: t.rows[0].count, votos: v.rows[0].count });
});

app.get('/api/equipo/:id', async (req, res) => {
  const r = await pool.query('SELECT * FROM equipo_trabajo WHERE coordinador_id = $1', [req.params.id]);
  res.json(r.rows);
});

app.post('/api/crear_referido', async (req, res) => {
  const { nombre, num_doc, mesa, celular, responsable_id, equipo_id } = req.body;
  try {
    const chk = await pool.query('SELECT * FROM referidos WHERE numero_documento = $1', [num_doc]);
    if (chk.rows.length > 0) return res.json({ exito: false, mensaje: '⚠️ CÉDULA DUPLICADA' });
    await pool.query('INSERT INTO referidos (nombre_completo, numero_documento, mesa_votacion, celular, responsable_id, equipo_id) VALUES ($1, $2, $3, $4, $5, $6)', [nombre, num_doc, mesa, celular, responsable_id, equipo_id || null]);
    res.json({ exito: true });
  } catch (err) { res.json({ exito: false, mensaje: err.message }); }
});

app.get('/api/verificar/:cedula', async (req, res) => {
  const { cedula } = req.params;
  const r = await pool.query(`SELECT r.*, u.nombres as nombre_coordinador FROM referidos r JOIN usuarios u ON r.responsable_id = u.id WHERE r.numero_documento = $1`, [cedula]);
  if (r.rows.length === 0) return res.json({ estado: 'NUEVO' });
  if (r.rows[0].estado_voto) return res.json({ estado: 'YA_VOTO', datos: r.rows[0] });
  return res.json({ estado: 'REGISTRADO', datos: r.rows[0] });
});

app.put('/api/referidos/votar/:cedula', async (req, res) => {
  await pool.query('UPDATE referidos SET estado_voto = true WHERE numero_documento = $1', [req.params.cedula]);
  res.json({ exito: true });
});

// OTROS ENDPOINTS DE GESTIÓN
app.get('/api/usuarios', async (req, res) => { const r = await pool.query('SELECT * FROM usuarios ORDER BY id DESC'); res.json(r.rows); });
app.post('/api/usuarios', async (req, res) => { const { nombres, apellidos, num_doc, password, rol } = req.body; await pool.query('INSERT INTO usuarios (nombres, apellidos, numero_documento, password, rol) VALUES ($1, $2, $3, $4, $5)', [nombres, apellidos, num_doc, password, rol]); res.json({ exito: true }); });
app.delete('/api/usuarios/:id', async (req, res) => { await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]); res.json({ exito: true }); });
app.post('/api/equipo', async (req, res) => { const { nombre, cedula, rol, coordinador_id } = req.body; await pool.query('INSERT INTO equipo_trabajo (nombre_completo, cedula, rol_equipo, coordinador_id) VALUES ($1, $2, $3, $4)', [nombre, cedula, rol, coordinador_id]); res.json({ exito: true }); });
app.delete('/api/equipo/:id', async (req, res) => { await pool.query('DELETE FROM equipo_trabajo WHERE id = $1', [req.params.id]); res.json({ exito: true }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`(JA12) Servidor MICROBLINK LIVE ${PORT}`);
});
