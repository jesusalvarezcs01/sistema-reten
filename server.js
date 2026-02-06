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
// V12: INTEGRACIÓN MANUAL (SIN ETIQUETA HTML)
// =================================================================
const APP_HTML = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Sistema Electoral</title>
    
    <script src="https://unpkg.com/@microblink/blinkid-in-browser-sdk@5.8.0/dist/blinkid-sdk.js"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    
    <style>
        * { box-sizing: border-box; }
        body, html { height: 100%; margin: 0; padding: 0; font-family: sans-serif; background: #000; overflow: hidden; }

        /* CONTENEDORES PRINCIPALES */
        #view-login { width: 100%; height: 100%; background: #003366; display: flex; align-items: center; justify-content: center; position: absolute; z-index: 50; }
        #view-dashboard { width: 100%; height: 100%; background: #f4f7f6; display: none; overflow-y: auto; position: absolute; z-index: 40; }
        #view-scanner { width: 100%; height: 100%; background: #000; display: none; position: absolute; z-index: 60; }

        /* ELEMENTOS UI */
        .card { background: white; width: 90%; max-width: 400px; padding: 25px; border-radius: 12px; margin: 20px auto; text-align: center; box-shadow: 0 4px 15px rgba(0,0,0,0.2); }
        .btn { width: 100%; padding: 15px; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 15px; color: white; cursor: pointer; }
        .btn-green { background: #28a745; }
        .btn-blue { background: #003366; }
        input { width: 100%; padding: 12px; margin-bottom: 10px; text-align: center; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; }

        /* CAMARA FULLSCREEN (IMPORTANTE) */
        #camera-feed { width: 100%; height: 100%; position: absolute; top: 0; left: 0; }
        /* Forzamos al video a ocupar todo */
        #camera-feed video { object-fit: cover; width: 100% !important; height: 100% !important; }

        /* UI SOBRE CAMARA */
        .scan-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 70; }
        .scan-header { padding: 15px; display: flex; justify-content: space-between; background: rgba(0,0,0,0.5); pointer-events: auto; }
        #scan-msg { position: absolute; top: 50%; width: 100%; text-align: center; color: white; transform: translateY(-50%); }

        /* MODAL */
        #modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 100; display: none; align-items: center; justify-content: center; }
        #modal-box { background: white; width: 85%; padding: 20px; border-radius: 10px; text-align: center; }
    </style>
</head>
<body>

    <script>
        const LICENCIA = "sRwCABpzaXN0ZW1hLXJldGVuLm9ucmVuZGVyLmNvbQZsZXlKRGNtVmhkR1ZrVDI0aU9qRTNOekF6TkRBNE56UXhORE1zSWtOeVpXRjBaV1JHYjNJaU9pSmhOVFkyT1RNeFppMWpNbVEyTFRRMk1UY3RZalF3T0MwM09Ea3dNVFJrT0RFMVpqQWlmUT09Xx8uagCPC8T3b3Qa3oHIoGgMBAgsat/gyX1+szaTbpLSxKbea+5LfnKoV2qjcJo5KX2BZfrFUBxFP093X0F3XpjecVfoJx+llc9E4c5k8MBT59V+d+ll6wtjn1EnjA==";
    </script>

    <div id="view-login">
        <div class="card">
            <h2 style="color:#003366">EL RETÉN 2026</h2>
            <input type="number" id="u" placeholder="Usuario">
            <input type="password" id="p" placeholder="Contraseña">
            <button class="btn btn-green" onclick="login()">INGRESAR</button>
        </div>
    </div>

    <div id="view-dashboard">
        <div style="background:#003366; color:white; padding:15px; display:flex; justify-content:space-between; position:sticky; top:0;">
            <b id="lbl-user">...</b> <span onclick="logout()" style="cursor:pointer">SALIR</span>
        </div>
        
        <div class="card" onclick="startCamera()" style="border: 3px solid #28a745;">
            <i class="fas fa-camera fa-3x" style="color:#28a745"></i>
            <h3>ESCANEAR CÉDULA</h3>
            <p>Modo Día D</p>
        </div>

        <div class="card" onclick="alert('Usa el escáner por ahora')">
            <h3>REGISTRO MANUAL</h3>
        </div>

        <div class="card">
            <h3>TOTAL: <span id="st-t">0</span> | VOTOS: <span id="st-v">0</span></h3>
        </div>
    </div>

    <div id="view-scanner">
        <div id="camera-feed"></div> <div class="scan-overlay">
            <div class="scan-header">
                <span style="color:white; font-weight:bold;">ESCANEANDO...</span>
                <button onclick="stopCamera()" style="background:white; border:none; padding:5px 15px; border-radius:20px;">CERRAR</button>
            </div>
            <div id="scan-msg">
                <i class="fas fa-spinner fa-spin fa-3x"></i><br><br>CARGANDO MOTOR...
            </div>
        </div>
    </div>

    <div id="modal"><div id="modal-box"></div></div>

    <script>
        const API = window.location.origin;
        let videoRecognizer = null;
        let sdkRunner = null;

        // --- MANEJO DE VISTAS (EXTREMO) ---
        function mostrarDashboard(user) {
            // BORRAMOS EL LOGIN DEL DOM PARA QUE NO MOLESTE
            const loginDiv = document.getElementById('view-login');
            if(loginDiv) loginDiv.remove(); 

            document.getElementById('view-dashboard').style.display = 'block';
            document.getElementById('lbl-user').innerText = user.nombres;
            cargarStats();
        }

        // --- MICROBLINK MANUAL ---
        async function startCamera() {
            document.getElementById('view-dashboard').style.display = 'none';
            document.getElementById('view-scanner').style.display = 'block';
            document.getElementById('scan-msg').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando Recursos...';

            try {
                // 1. Verificar soporte
                if (!BlinkIDSDK.isBrowserSupported()) {
                    alert("Navegador no soportado"); return stopCamera();
                }

                // 2. Cargar el archivo WASM (El cerebro)
                const loadSettings = new BlinkIDSDK.WasmSDKLoadSettings(LICENCIA);
                
                // PUNTO CRITICO: Definimos la ruta exacta de los recursos en UNPKG
                loadSettings.engineLocation = "https://unpkg.com/@microblink/blinkid-in-browser-sdk@5.8.0/resources/";

                document.getElementById('scan-msg').innerText = "Descargando Motor IA...";
                
                // 3. Crear el SDK
                const sdk = await BlinkIDSDK.loadWasmModule(loadSettings);
                sdkRunner = sdk;

                document.getElementById('scan-msg').innerText = "Iniciando Cámara...";

                // 4. Crear reconocedor
                const recognizer = await BlinkIDSDK.createBlinkIdRecognizer(sdk);
                const recognizerRunner = await BlinkIDSDK.createRecognizerRunner(sdk, [recognizer], false);

                // 5. Iniciar Video en el Div 'camera-feed'
                videoRecognizer = await BlinkIDSDK.VideoRecognizer.createVideoRecognizerFromCameraStream(
                    document.getElementById('camera-feed'),
                    recognizerRunner
                );

                // 6. Iniciar reconocimiento
                document.getElementById('scan-msg').style.display = 'none'; // Ocultar texto
                
                await videoRecognizer.startRecognition(async (state) => {
                    if (state === BlinkIDSDK.RecognizerResultState.Valid) {
                        const result = await recognizer.getResult();
                        
                        // Extraer numero
                        let doc = result.documentNumber || result.mrz.documentNumber || result.mrz.primaryId;
                        
                        if(doc) {
                            videoRecognizer.pauseRecognition(); // Pausar
                            let cedula = doc.replace(/[^0-9]/g, '');
                            procesarCedula(cedula);
                        }
                    }
                });

            } catch (err) {
                console.error(err);
                alert("Error iniciando escáner: " + err.message);
                stopCamera();
            }
        }

        function stopCamera() {
            if (videoRecognizer) {
                videoRecognizer.releaseVideoFeed();
                videoRecognizer = null;
            }
            if (sdkRunner) {
                // sdkRunner.delete(); // Opcional limpieza
                sdkRunner = null;
            }
            // Recargar pagina para limpiar memoria RAM del celular (Es lo mas seguro)
            location.reload();
        }

        // --- LOGICA NEGOCIO ---
        async function procesarCedula(cedula) {
            const modal = document.getElementById('modal');
            const box = document.getElementById('modal-box');
            modal.style.display = 'flex';
            box.innerHTML = '<h3>⏳ Verificando '+cedula+'...</h3>';

            try {
                const res = await fetch(API+'/api/verificar/'+cedula);
                const d = await res.json();

                if(d.estado === 'NUEVO') {
                    box.innerHTML = '<h1 style="color:red">X</h1><h3>NO REGISTRADO</h3><button class="btn btn-blue" onclick="stopCamera()">OK</button>';
                } else if(d.estado === 'YA_VOTO') {
                    box.innerHTML = '<h1 style="color:orange">⚠️</h1><h3>YA VOTÓ</h3><p>'+d.datos.nombre_coordinador+'</p><button class="btn btn-blue" onclick="stopCamera()">OK</button>';
                } else {
                    await fetch(API+'/api/referidos/votar/'+cedula, {method:'PUT'});
                    box.innerHTML = '<h1 style="color:green">✅</h1><h3>EXITOSO</h3><p>'+d.datos.nombre_completo+'</p><button class="btn btn-blue" onclick="stopCamera()">SIGUIENTE</button>';
                }
            } catch(e) {
                box.innerHTML = 'Error conexión';
                setTimeout(stopCamera, 2000);
            }
        }

        async function login() {
            const u = document.getElementById('u').value;
            const p = document.getElementById('p').value;
            const res = await fetch(API+'/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({usuario:u, password:p})});
            const data = await res.json();
            if(data.exito) {
                localStorage.setItem('user', JSON.stringify(data.usuario));
                mostrarDashboard(data.usuario);
            } else alert('Error credenciales');
        }

        async function cargarStats() {
            const res = await fetch(API+'/api/dashboard/stats');
            const d = await res.json();
            document.getElementById('st-t').innerText = d.total;
            document.getElementById('st-v').innerText = d.votos;
        }

        function logout() { localStorage.clear(); location.reload(); }

        window.onload = () => {
            if(localStorage.getItem('user')) mostrarDashboard(JSON.parse(localStorage.getItem('user')));
        };
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
  // RESETEA SOLO SI ES NECESARIO
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
