const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
const https = require('https'); 
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// =================================================================
// 1. PROXY INTELIGENTE (SOLUCIÓN AL CONGELAMIENTO)
// =================================================================
app.get('/sdk-resources/:filename', (req, res) => {
    const filename = req.params.filename;
    // Usamos la versión 5.8.0 consistente
    const remoteUrl = `https://cdn.jsdelivr.net/npm/@microblink/blinkid-in-browser-sdk@5.8.0/resources/${filename}`;

    https.get(remoteUrl, (remoteRes) => {
        // --- AQUÍ ESTÁ LA CORRECCIÓN CRÍTICA ---
        // Forzamos el tipo de archivo correcto para que el celular no se bloquee
        if (filename.endsWith('.wasm')) {
            res.set('Content-Type', 'application/wasm');
        } else if (filename.endsWith('.js')) {
            res.set('Content-Type', 'application/javascript');
        } else if (filename.endsWith('.json')) {
            res.set('Content-Type', 'application/json');
        } else {
            // Fallback al que traiga el servidor
            res.set('Content-Type', remoteRes.headers['content-type']);
        }
        
        // Permisos para que el navegador confíe
        res.set('Access-Control-Allow-Origin', '*');
        
        // Enviamos el archivo
        remoteRes.pipe(res);
    }).on('error', (e) => {
        console.error("Proxy Error:", e);
        res.status(500).send("Error");
    });
});

// =================================================================
// 2. INTERFAZ GRÁFICA (V20)
// =================================================================
const APP_HTML = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Sistema Electoral</title>
    
    <script src="https://cdn.jsdelivr.net/npm/@microblink/blinkid-in-browser-sdk@5.8.0/ui/dist/blinkid-in-browser/blinkid-in-browser.js"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    
    <style>
        * { box-sizing: border-box; }
        body, html { height: 100%; margin: 0; padding: 0; font-family: 'Segoe UI', sans-serif; background: #000; overflow: hidden; }

        /* CAPAS */
        #layer-app { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #f4f7f6; z-index: 10; overflow-y: auto; }
        #layer-scanner { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #000; z-index: 9999; display: none; flex-direction: column; }

        /* UI */
        .card { background: white; width: 90%; max-width: 400px; padding: 25px; border-radius: 15px; margin: 20px auto; text-align: center; box-shadow: 0 5px 20px rgba(0,0,0,0.1); }
        .btn { width: 100%; padding: 15px; border: none; border-radius: 10px; font-weight: bold; font-size: 16px; margin-top: 15px; color: white; cursor: pointer; }
        .btn-green { background: #28a745; }
        .btn-blue { background: #003366; }
        input { width: 100%; padding: 15px; margin-bottom: 10px; text-align: center; border: 1px solid #ccc; border-radius: 8px; font-size: 16px; }

        /* CAMARA */
        blinkid-in-browser { width: 100%; height: 100%; display: block; background: black; }
        
        .scan-controls { position: absolute; top: 0; left: 0; width: 100%; padding: 20px; display: flex; justify-content: space-between; z-index: 10000; background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent); }
        
        /* LOADER CON ERROR HANDLING VISUAL */
        #loader {
            position: absolute; top: 40%; width: 100%; text-align: center; color: white; z-index: 9000;
        }
        #loader-error { display: none; color: #ff6b6b; margin-top: 10px; }

        /* MODAL */
        #modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); z-index: 20000; display: none; align-items: center; justify-content: center; }
        #modal-box { background: white; padding: 30px; border-radius: 15px; width: 85%; max-width: 350px; text-align: center; }
    </style>
</head>
<body>

    <script>
        const LICENCIA = "sRwCABpzaXN0ZW1hLXJldGVuLm9ucmVuZGVyLmNvbQZsZXlKRGNtVmhkR1ZrVDI0aU9qRTNOekF6TkRBNE56UXhORE1zSWtOeVpXRjBaV1JHYjNJaU9pSmhOVFkyT1RNeFppMWpNbVEyTFRRMk1UY3RZalF3T0MwM09Ea3dNVFJrT0RFMVpqQWlmUT09Xx8uagCPC8T3b3Qa3oHIoGgMBAgsat/gyX1+szaTbpLSxKbea+5LfnKoV2qjcJo5KX2BZfrFUBxFP093X0F3XpjecVfoJx+llc9E4c5k8MBT59V+d+ll6wtjn1EnjA==";
    </script>

    <div id="layer-app">
        <div id="view-login" style="height: 100vh; display: flex; align-items: center; justify-content: center; background: #003366;">
            <div class="card">
                <h2 style="color:#003366;">CONTROL ELECTORAL</h2>
                <input type="number" id="l-user" placeholder="Cédula">
                <input type="password" id="l-pass" placeholder="Contraseña">
                <button class="btn btn-green" onclick="doLogin()">INGRESAR</button>
            </div>
        </div>

        <div id="view-dashboard" style="display:none;">
            <div style="background:#003366; color:white; padding:15px; display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:100;">
                <div>👋 <b id="u-name">...</b></div>
                <div onclick="logout()" style="cursor:pointer;"><i class="fas fa-sign-out-alt"></i> SALIR</div>
            </div>
            <div style="padding: 20px;">
                <div class="card" onclick="irRegistro()">
                    <h3>REGISTRO MANUAL</h3><p>Teclado</p>
                </div>
                <div class="card" onclick="activarCamara()" style="border: 2px solid #28a745;">
                    <h3 style="color:#28a745;">ESCANEAR CÉDULA</h3>
                    <p>PDF417 y Digital</p>
                    <button class="btn btn-green">INICIAR</button>
                </div>
                <div class="card">
                    <h3>ESTADÍSTICAS</h3>
                    <h2><span id="s-votos" style="color:green;">0</span> / <span id="s-total">0</span></h2>
                </div>
            </div>
        </div>

        <div id="view-registro" style="display:none; padding-top:20px;">
            <div class="card">
                <h3>Nuevo</h3>
                <input type="text" id="r-nom" placeholder="Nombre"><input type="number" id="r-ced" placeholder="Cédula">
                <button class="btn btn-blue" onclick="guardar()">GUARDAR</button><button class="btn btn-red" onclick="verDashboard()">CANCELAR</button>
            </div>
        </div>
    </div>

    <div id="layer-scanner">
        <div class="scan-controls">
            <span style="color:white; font-weight:bold;">ESCANEANDO...</span>
            <button onclick="cerrarCamara()" style="background:rgba(255,255,255,0.2); color:white; border:1px solid white; padding:5px 15px; border-radius:20px;">CERRAR</button>
        </div>
        
        <div id="loader">
            <i class="fas fa-circle-notch fa-spin fa-3x"></i><br><br>
            <span id="loader-msg">CARGANDO MOTOR IA...</span>
            <div id="loader-error">
                Demora mucho...<br>
                <button class="btn btn-blue" onclick="location.reload()">RECARGAR PÁGINA</button>
            </div>
        </div>

        <blinkid-in-browser id="scanner-el"></blinkid-in-browser>
    </div>

    <div id="modal-overlay"><div id="modal-box"></div></div>

    <script>
        const API = window.location.origin;
        let currentUser = null;

        function verDashboard() {
            document.getElementById('view-login').style.display = 'none';
            document.getElementById('view-registro').style.display = 'none';
            document.getElementById('view-dashboard').style.display = 'block';
            cargarStats();
        }
        function irRegistro() {
            document.getElementById('view-dashboard').style.display = 'none';
            document.getElementById('view-registro').style.display = 'block';
        }

        // --- CÁMARA ---
        async function activarCamara() {
            document.getElementById('layer-app').style.display = 'none';
            document.getElementById('layer-scanner').style.display = 'flex';
            document.getElementById('loader').style.display = 'block';
            
            // Timeout de seguridad visual
            setTimeout(() => {
                if(document.getElementById('loader').style.display !== 'none') {
                    document.getElementById('loader-error').style.display = 'block';
                    document.getElementById('loader-msg').innerText = "Problema de conexión";
                }
            }, 15000);

            try {
                const el = document.getElementById('scanner-el');
                
                if (el.blinkId) { 
                    document.getElementById('loader').style.display = 'none';
                    return; 
                }

                el.licenseKey = LICENCIA;
                // APUNTAMOS AL PROXY LOCAL QUE ARREGLAMOS ARRIBA
                el.engineLocation = window.location.origin + "/sdk-resources/"; 
                el.recognizers = ['BlinkIdRecognizer']; 
                el.uiSettings = { enableFullScreen: true, showOverlay: true };

                el.addEventListener('scanSuccess', (ev) => {
                    const r = ev.detail.recognizers.BlinkIdRecognizer;
                    if (r.resultState === 'Valid') {
                        const doc = r.documentNumber || r.mrz.documentNumber || r.barcode.data;
                        if(doc) {
                            let cedula = doc.replace(/[^0-9]/g, '');
                            if (cedula.length >= 6) {
                                cerrarCamara();
                                verificarCedula(cedula);
                            }
                        }
                    }
                });

                el.addEventListener('fatalError', (ev) => {
                    alert("Error Fatal: " + ev.detail.message);
                    cerrarCamara();
                });

                el.addEventListener('ready', () => {
                    document.getElementById('loader').style.display = 'none';
                });

            } catch(e) {
                alert("Error JS: " + e.message);
                cerrarCamara();
            }
        }

        function cerrarCamara() {
            document.getElementById('layer-scanner').style.display = 'none';
            document.getElementById('layer-app').style.display = 'block';
            setTimeout(() => location.reload(), 200);
        }

        // --- NEGOCIO ---
        async function verificarCedula(cedula) {
            const box = document.getElementById('modal-box');
            document.getElementById('modal-overlay').style.display = 'flex';
            box.innerHTML = '<h3>Consultando '+cedula+'...</h3>';

            try {
                const res = await fetch(API+'/api/verificar/'+cedula);
                const d = await res.json();

                if(d.estado === 'NUEVO') {
                    box.innerHTML = '<h1 style="color:red">X</h1><h3>NO REGISTRADO</h3><button class="btn btn-blue" onclick="location.reload()">OK</button>';
                } else if(d.estado === 'YA_VOTO') {
                    box.innerHTML = '<h1 style="color:orange">⚠️</h1><h3>YA VOTÓ</h3><p>'+d.datos.nombre_coordinador+'</p><button class="btn btn-blue" onclick="location.reload()">OK</button>';
                } else {
                    await fetch(API+'/api/referidos/votar/'+cedula, {method:'PUT'});
                    box.innerHTML = '<h1 style="color:green">✅</h1><h3>EXITOSO</h3><p>'+d.datos.nombre_completo+'</p><button class="btn btn-blue" onclick="location.reload()">OK</button>';
                }
            } catch(e) { alert("Error"); location.reload(); }
        }

        // --- LOGIN ---
        async function doLogin() {
            const u = document.getElementById('l-user').value;
            const p = document.getElementById('l-pass').value;
            const res = await fetch(API+'/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({usuario:u, password:p})});
            const data = await res.json();
            if(data.exito) {
                localStorage.setItem('user', JSON.stringify(data.usuario));
                checkSession();
            } else alert('Error credenciales');
        }

        function checkSession() {
            const s = localStorage.getItem('user');
            if(s) {
                currentUser = JSON.parse(s);
                document.getElementById('view-login').style.display = 'none';
                document.getElementById('u-name').innerText = currentUser.nombres;
                verDashboard();
            }
        }
        function logout() { localStorage.removeItem('user'); location.reload(); }

        async function guardar() {
            const data = { nombre: document.getElementById('r-nom').value, num_doc: document.getElementById('r-ced').value, responsable_id: currentUser.id };
            await fetch(API+'/api/crear_referido', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
            alert('Guardado'); document.getElementById('r-ced').value=''; verDashboard();
        }

        async function cargarStats() {
            try {
                const res = await fetch(API+'/api/dashboard/stats');
                const d = await res.json();
                document.getElementById('s-total').innerText = d.total;
                document.getElementById('s-votos').innerText = d.votos;
            } catch(e) {}
        }

        window.onload = checkSession;
    </script>
</body>
</html>
`;

// =================================================================
// BACKEND
// =================================================================
app.get('/', (req, res) => res.send(APP_HTML));

app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;
  const r = await pool.query('SELECT * FROM usuarios WHERE numero_documento = $1 AND password = $2', [usuario, password]);
  if(r.rows.length > 0) res.json({exito:true, usuario:r.rows[0]});
  else res.json({exito:false});
});

app.get('/api/dashboard/stats', async (req, res) => {
  const t = await pool.query('SELECT COUNT(*) FROM referidos');
  const v = await pool.query('SELECT COUNT(*) FROM referidos WHERE estado_voto = true');
  res.json({ total: t.rows[0].count, votos: v.rows[0].count });
});

app.post('/api/crear_referido', async (req, res) => {
  const { nombre, num_doc, responsable_id } = req.body;
  try {
    const chk = await pool.query('SELECT * FROM referidos WHERE numero_documento = $1', [num_doc]);
    if(chk.rows.length>0) return res.json({exito:false, mensaje:'DUPLICADO'});
    await pool.query('INSERT INTO referidos (nombre_completo, numero_documento, responsable_id) VALUES ($1, $2, $3)', [nombre, num_doc, responsable_id]);
    res.json({exito:true});
  } catch(e) { res.json({exito:false, mensaje:e.message}); }
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

app.get('/setup_master_v3', async (req, res) => {
  try {
    await pool.query('DROP TABLE IF EXISTS referidos; DROP TABLE IF EXISTS usuarios;');
    await pool.query(`CREATE TABLE usuarios (id SERIAL PRIMARY KEY, nombres VARCHAR(100), numero_documento VARCHAR(20), password VARCHAR(100), rol VARCHAR(20));`);
    await pool.query(`CREATE TABLE referidos (id SERIAL PRIMARY KEY, nombre_completo VARCHAR(150), numero_documento VARCHAR(20), mesa_votacion VARCHAR(10), estado_voto BOOLEAN DEFAULT FALSE, responsable_id INTEGER);`);
    await pool.query(`INSERT INTO usuarios (nombres, numero_documento, password, rol) VALUES ('Admin', 'admin', 'admin2026', 'ADMIN');`);
    res.send("RESET OK");
  } catch(e) { res.send(e.message); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SERVER ON ${PORT}`));
