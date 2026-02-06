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
// CÓDIGO MAESTRO V6: FORZADO DE PERMISOS + MICROBLINK
// =================================================================
const APP_HTML = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Sistema Electoral</title>
    
    <script src="https://cdn.jsdelivr.net/npm/@microblink/blinkid-in-browser-sdk@6.1.0/ui/dist/blinkid-in-browser/blinkid-in-browser.js"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    
    <style>
        body, html { height: 100%; margin: 0; padding: 0; font-family: sans-serif; background: #f0f2f5; overflow: hidden; }

        /* CAPA 1: UI GLOBAL */
        #layer-ui {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            overflow-y: auto; z-index: 10; background: #f4f7f6;
        }

        /* CAPA 2: CÁMARA (NEGRA) */
        #layer-camera {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #000; z-index: 9999;
            display: none; /* Oculto */
            flex-direction: column;
        }

        /* ESTILOS GENERALES */
        .card { background: white; width: 90%; max-width: 400px; padding: 20px; border-radius: 12px; margin: 20px auto; text-align: center; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .btn { width: 100%; padding: 15px; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 10px; color: white; cursor: pointer; }
        .btn-blue { background: #003366; }
        .btn-green { background: #28a745; }
        .btn-red { background: #dc3545; }
        input { width: 100%; padding: 12px; margin-bottom: 10px; text-align: center; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }

        /* CABECERA CAMARA */
        .cam-header {
            position: absolute; top: 0; left: 0; width: 100%; height: 60px;
            background: rgba(0,0,0,0.6); z-index: 10000;
            display: flex; align-items: center; justify-content: space-between; padding: 0 15px; box-sizing: border-box; color: white;
        }

        /* COMPONENTE MICROBLINK */
        blinkid-in-browser { width: 100%; height: 100%; display: block; }

        /* LOADING CÁMARA */
        #cam-msg {
            position: absolute; top: 50%; width: 100%; text-align: center; color: white;
            transform: translateY(-50%); z-index: 9000;
        }

        /* MODAL RESULTADOS */
        #modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.9); z-index: 20000;
            display: none; align-items: center; justify-content: center;
        }
    </style>
</head>
<body>

    <script>
        // TU LICENCIA
        const LICENCIA = "sRwCABpzaXN0ZW1hLXJldGVuLm9ucmVuZGVyLmNvbQZsZXlKRGNtVmhkR1ZrVDI0aU9qRTNOekF6TkRBNE56UXhORE1zSWtOeVpXRjBaV1JHYjNJaU9pSmhOVFkyT1RNeFppMWpNbVEyTFRRMk1UY3RZalF3T0MwM09Ea3dNVFJrT0RFMVpqQWlmUT09Xx8uagCPC8T3b3Qa3oHIoGgMBAgsat/gyX1+szaTbpLSxKbea+5LfnKoV2qjcJo5KX2BZfrFUBxFP093X0F3XpjecVfoJx+llc9E4c5k8MBT59V+d+ll6wtjn1EnjA==";
    </script>

    <div id="layer-ui">
        
        <div id="view-login" style="height: 100vh; display: flex; align-items: center; justify-content: center; background: #003366;">
            <div class="card">
                <h2>CONTROL ELECTORAL</h2>
                <input type="number" id="l-user" placeholder="Cédula Usuario">
                <input type="password" id="l-pass" placeholder="Contraseña">
                <button class="btn btn-green" onclick="doLogin()">INGRESAR</button>
                <p id="l-error" style="color:red; display:none; margin-top:10px;">Datos incorrectos</p>
            </div>
        </div>

        <div id="view-dashboard" style="display:none; padding-top: 60px;">
            <div style="background:#003366; color:white; padding:15px; position:fixed; top:0; left:0; width:100%; z-index:100; display:flex; justify-content:space-between; box-sizing:border-box;">
                <b id="u-name">Usuario</b>
                <span onclick="logout()" style="text-decoration:underline;">SALIR</span>
            </div>

            <div class="card" onclick="irRegistro()">
                <h3>📝 REGISTRO MANUAL</h3>
                <p>Ingreso sin escáner</p>
            </div>

            <div class="card" onclick="iniciarSecuenciaCamara()" style="border: 3px solid #28a745;">
                <h3 style="color:#28a745">📷 OPERACIÓN DÍA D</h3>
                <p>Escáner de Cédulas</p>
            </div>

            <div class="card">
                <h3>Resumen</h3>
                <div style="display:flex; justify-content:space-around; font-size:1.2rem;">
                    <div><b>Total:</b> <span id="s-total">0</span></div>
                    <div style="color:green;"><b>Votos:</b> <span id="s-votos">0</span></div>
                </div>
            </div>
        </div>

        <div id="view-registro" style="display:none; padding-top:20px;">
            <div class="card">
                <h3>Nuevo Votante</h3>
                <input type="text" id="r-nom" placeholder="Nombre">
                <input type="number" id="r-ced" placeholder="Cédula">
                <button class="btn btn-blue" onclick="guardar()">GUARDAR</button>
                <button class="btn btn-red" onclick="verDashboard()">VOLVER</button>
            </div>
        </div>
    </div>

    <div id="layer-camera">
        <div class="cam-header">
            <span>Escaneando...</span>
            <button onclick="cerrarCamara()" style="background:white; color:black; border:none; padding:5px 15px; border-radius:20px; font-weight:bold;">X</button>
        </div>
        
        <div id="cam-msg">
            <i class="fas fa-spinner fa-spin fa-3x"></i><br><br>
            <span id="cam-txt">Inicializando...</span>
        </div>

        <blinkid-in-browser
            id="scanner-el"
            engine-location="https://cdn.jsdelivr.net/npm/@microblink/blinkid-in-browser-sdk@6.1.0/resources/"
        ></blinkid-in-browser>
    </div>

    <div id="modal-overlay">
        <div class="card" id="modal-content"></div>
    </div>

    <script>
        const API = window.location.origin;
        let currentUser = null;

        // --- 1. SECUENCIA DE ARRANQUE CÁMARA (CRÍTICO) ---
        async function iniciarSecuenciaCamara() {
            // A. Cambiar UI inmediatamente
            document.getElementById('layer-ui').style.display = 'none';
            document.getElementById('layer-camera').style.display = 'flex';
            document.getElementById('cam-txt').innerText = "Solicitando permiso de cámara...";

            try {
                // B. FORZAR PERMISO NATIVO (Truco para despertar al navegador)
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                
                // Si llegamos aquí, dio permiso. Cerramos este stream temporal.
                stream.getTracks().forEach(track => track.stop());
                
                // C. Ahora sí, arrancamos el motor pesado
                document.getElementById('cam-txt').innerText = "Cargando motor de IA...";
                arrancarMicroblink();

            } catch (err) {
                alert("❌ No diste permiso de cámara. No podemos escanear.");
                cerrarCamara();
            }
        }

        function arrancarMicroblink() {
            const el = document.getElementById('scanner-el');
            
            // Configuración
            el.licenseKey = LICENCIA;
            el.recognizers = ['BlinkIdRecognizer'];
            el.uiSettings = { 
                enableFullScreen: false, // Controlamos nosotros el tamaño
                showOverlay: true 
            };

            // Eventos
            el.addEventListener('scanSuccess', (ev) => {
                const results = ev.detail.recognizers.BlinkIdRecognizer;
                if (results.resultState === 'Valid') {
                    const docNumber = results.documentNumber || results.mrz.documentNumber || results.mrz.primaryId;
                    if(docNumber) {
                        let cedula = docNumber.replace(/[^0-9]/g, ''); // Limpiar
                        if(cedula.length > 5) {
                            cerrarCamara(); // Éxito
                            procesarCedula(cedula);
                        }
                    }
                }
            });

            el.addEventListener('fatalError', (ev) => {
                alert("Error del motor: " + ev.detail.message);
                cerrarCamara();
            });

            el.addEventListener('scanError', (ev) => {
                 if(ev.detail.code === "LicenseError") alert("Error de Licencia (Dominio incorrecto)");
            });

            // Ocultar mensaje de carga tras unos segundos
            setTimeout(() => { document.getElementById('cam-msg').style.display = 'none'; }, 2000);
        }

        function cerrarCamara() {
            document.getElementById('layer-camera').style.display = 'none';
            document.getElementById('layer-ui').style.display = 'block';
            // Recargar para limpiar la memoria de video (importante en iOS)
            window.location.reload();
        }

        // --- 2. LÓGICA DE NEGOCIO ---
        
        async function procesarCedula(cedula) {
            mostrarModal('loading', 'Verificando '+cedula);
            
            try {
                const res = await fetch(API + '/api/verificar/' + cedula);
                const data = await res.json();

                if(data.estado === 'NUEVO') {
                    mostrarModal('error', 'NO REGISTRADO', 'Cédula: '+cedula);
                } else if(data.estado === 'YA_VOTO') {
                    mostrarModal('warning', 'YA VOTÓ', 'Resp: '+data.datos.nombre_coordinador);
                } else {
                    // Registrar voto
                    await fetch(API + '/api/referidos/votar/' + cedula, {method:'PUT'});
                    mostrarModal('success', 'VOTO REGISTRADO', data.datos.nombre_completo);
                }
            } catch(e) {
                mostrarModal('error', 'Error Conexión');
            }
        }

        function mostrarModal(tipo, titulo, msg='') {
            const ol = document.getElementById('modal-overlay');
            const box = document.getElementById('modal-content');
            ol.style.display = 'flex';
            
            let color = 'black';
            if(tipo==='success') color = 'green';
            if(tipo==='error') color = 'red';
            if(tipo==='warning') color = 'orange';

            if(tipo === 'loading') {
                box.innerHTML = '<h3>⏳ '+titulo+'</h3>';
            } else {
                box.innerHTML = \`<h1 style="color:\${color}">\${tipo === 'success' ? '✅' : '⚠️'}</h1>
                                <h3>\${titulo}</h3>
                                <p>\${msg}</p>
                                <button class="btn btn-blue" onclick="cerrarModal()">ACEPTAR</button>\`;
            }
        }

        function cerrarModal() { 
            document.getElementById('modal-overlay').style.display = 'none'; 
            cargarStats();
        }

        // --- 3. LOGIN Y NAVEGACION ---
        async function doLogin() {
            const u = document.getElementById('l-user').value;
            const p = document.getElementById('l-pass').value;
            const res = await fetch(API+'/api/login', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({usuario:u, password:p})
            });
            const data = await res.json();
            if(data.exito) {
                localStorage.setItem('user', JSON.stringify(data.usuario));
                checkSession();
            } else {
                document.getElementById('l-error').style.display = 'block';
            }
        }

        function checkSession() {
            const s = localStorage.getItem('user');
            if(s) {
                currentUser = JSON.parse(s);
                document.getElementById('view-login').style.display = 'none';
                document.getElementById('view-dashboard').style.display = 'block';
                document.getElementById('u-name').innerText = currentUser.nombres;
                cargarStats();
            }
        }

        function logout() { localStorage.removeItem('user'); location.reload(); }
        function verDashboard() {
            document.getElementById('view-registro').style.display = 'none';
            document.getElementById('view-dashboard').style.display = 'block';
            cargarStats();
        }
        function irRegistro() {
            document.getElementById('view-dashboard').style.display = 'none';
            document.getElementById('view-registro').style.display = 'block';
        }

        async function guardar() {
            const data = {
                nombre: document.getElementById('r-nom').value,
                num_doc: document.getElementById('r-ced').value,
                responsable_id: currentUser.id
            };
            await fetch(API+'/api/crear_referido', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
            alert('Guardado');
            document.getElementById('r-ced').value='';
            verDashboard();
        }

        async function cargarStats() {
            const res = await fetch(API+'/api/dashboard/stats');
            const d = await res.json();
            document.getElementById('s-total').innerText = d.total;
            document.getElementById('s-votos').innerText = d.votos;
        }

        // Init
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
