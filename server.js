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
// SOLUCIÓN V5: ARRANQUE MANUAL DE CÁMARA
// =================================================================
const APP_HTML = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Sistema Electoral</title>
    
    <script src="https://unpkg.com/@microblink/blinkid-in-browser-sdk@6.1.0/ui/dist/blinkid-in-browser/blinkid-in-browser.js"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    
    <style>
        body, html { height: 100%; margin: 0; padding: 0; font-family: sans-serif; background: #f0f2f5; overflow: hidden; }

        /* --- CAPAS DE LA APP --- */
        #ui-layer {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            overflow-y: auto; z-index: 10; background: #f4f7f6;
        }

        #camera-layer {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #000; z-index: 9999;
            display: none; /* Oculto por defecto */
            flex-direction: column;
        }

        /* COMPONENTES */
        .card { background: white; width: 90%; max-width: 400px; padding: 20px; border-radius: 10px; margin: 20px auto; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .btn { width: 100%; padding: 15px; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 10px; color: white; cursor: pointer; }
        .btn-blue { background: #003366; }
        .btn-green { background: #28a745; }
        
        input { width: 100%; padding: 12px; margin-bottom: 10px; text-align: center; border: 1px solid #ddd; border-radius: 5px; box-sizing:border-box; }

        /* HEADER CAMARA */
        .scan-header {
            position: absolute; top: 0; left: 0; width: 100%; height: 60px;
            background: rgba(0,0,0,0.8); z-index: 10000;
            display: flex; align-items: center; justify-content: space-between; padding: 0 15px; box-sizing: border-box; color: white;
        }

        /* BOTÓN FLOTANTE PARA FORZAR CAMARA */
        #btn-force-start {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            z-index: 99999; background: #28a745; color: white; padding: 20px 40px;
            border-radius: 50px; font-weight: bold; border: 2px solid white;
            box-shadow: 0 0 20px rgba(0,255,0,0.5); cursor: pointer;
            display: none; /* Se muestra si no arranca sola */
        }
        
        /* ESTADO DE CARGA */
        #scan-status {
            position: absolute; bottom: 100px; width: 100%; text-align: center; color: white; font-weight: bold; z-index: 10000;
        }

        /* MICROBLINK ELEMENT */
        blinkid-in-browser {
            width: 100%; height: 100%; display: block;
        }

        /* MODAL */
        #modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 20000; display: none; align-items: center; justify-content: center; }
        #modal-box { background: white; padding: 25px; border-radius: 10px; width: 85%; max-width: 350px; text-align: center; }
    </style>
</head>
<body>

    <script>
        const LICENCIA = "sRwCABpzaXN0ZW1hLXJldGVuLm9ucmVuZGVyLmNvbQZsZXlKRGNtVmhkR1ZrVDI0aU9qRTNOekF6TkRBNE56UXhORE1zSWtOeVpXRjBaV1JHYjNJaU9pSmhOVFkyT1RNeFppMWpNbVEyTFRRMk1UY3RZalF3T0MwM09Ea3dNVFJrT0RFMVpqQWlmUT09Xx8uagCPC8T3b3Qa3oHIoGgMBAgsat/gyX1+szaTbpLSxKbea+5LfnKoV2qjcJo5KX2BZfrFUBxFP093X0F3XpjecVfoJx+llc9E4c5k8MBT59V+d+ll6wtjn1EnjA==";
    </script>

    <div id="ui-layer">
        
        <div id="view-login" style="height: 100vh; display: flex; align-items: center; justify-content: center; background: #003366;">
            <div class="card">
                <h2>CONTROL ELECTORAL</h2>
                <input type="number" id="l-user" placeholder="Usuario">
                <input type="password" id="l-pass" placeholder="Contraseña">
                <button class="btn btn-green" onclick="login()">ENTRAR</button>
                <p id="l-msg" style="color:red; display:none;">Error de acceso</p>
            </div>
        </div>

        <div id="view-menu" style="display:none; padding-top: 50px;">
            <div style="background:#003366; color:white; padding:15px; position:fixed; top:0; width:100%; z-index:100; box-sizing:border-box; display:flex; justify-content:space-between;">
                <b id="u-name">Usuario</b>
                <span onclick="logout()">SALIR</span>
            </div>
            
            <div class="card" onclick="irRegistro()">
                <h3>📝 REGISTRO MANUAL</h3>
            </div>

            <div class="card" onclick="prepararCamara()" style="border: 3px solid #28a745;">
                <h3 style="color:#28a745;">📷 DÍA D (ESCÁNER)</h3>
            </div>

            <div class="card">
                <h3>📊 RESUMEN</h3>
                <h1><span id="st-votos" style="color:green">0</span> / <span id="st-total">0</span></h1>
            </div>
        </div>

        <div id="view-registro" style="display:none; padding-top:20px;">
            <div class="card">
                <h3>Nuevo Votante</h3>
                <input type="text" id="r-nom" placeholder="Nombre">
                <input type="number" id="r-ced" placeholder="Cédula">
                <button class="btn btn-blue" onclick="guardar()">GUARDAR</button>
                <button class="btn btn-red" onclick="verMenu()">CANCELAR</button>
            </div>
        </div>
    </div>

    <div id="camera-layer">
        <div class="scan-header">
            <b>Escáner Cédulas</b>
            <button onclick="cerrarCamara()" style="background:white; color:black; border:none; padding:5px 15px; border-radius:15px;">X</button>
        </div>

        <button id="btn-force-start" onclick="forzarInicioCamara()">TOCA PARA INICIAR CÁMARA</button>

        <div id="scan-status">Esperando motor...</div>

        <blinkid-in-browser
            id="my-blinkid"
            engine-location="https://unpkg.com/@microblink/blinkid-in-browser-sdk@6.1.0/resources/"
        ></blinkid-in-browser>
    </div>

    <div id="modal">
        <div id="modal-box"></div>
    </div>

    <script>
        const API = window.location.origin;
        let currentUser = null;

        // --- MANEJO DE VISTAS ---
        function verMenu() {
            document.getElementById('view-login').style.display = 'none';
            document.getElementById('view-registro').style.display = 'none';
            document.getElementById('view-menu').style.display = 'block';
            cargarStats();
        }
        function irRegistro() {
            document.getElementById('view-menu').style.display = 'none';
            document.getElementById('view-registro').style.display = 'block';
        }

        // --- LOGICA CAMARA ---
        function prepararCamara() {
            document.getElementById('ui-layer').style.display = 'none';
            document.getElementById('camera-layer').style.display = 'flex';
            
            // Mostrar botón de inicio manual para garantizar interacción del usuario (requisito de navegadores)
            document.getElementById('btn-force-start').style.display = 'block';
            document.getElementById('scan-status').innerText = "Toca el botón verde para activar";
        }

        async function forzarInicioCamara() {
            const btn = document.getElementById('btn-force-start');
            const status = document.getElementById('scan-status');
            const el = document.querySelector('blinkid-in-browser');

            btn.style.display = 'none';
            status.innerText = "⏳ Cargando motor inteligente... (Esto puede tardar unos segundos)";

            try {
                // Configurar
                el.licenseKey = LICENCIA;
                el.recognizers = ['BlinkIdRecognizer'];
                
                // Configuración de UI para que ocupe todo
                el.uiSettings = { 
                    enableFullScreen: false, // Lo manejamos nosotros
                    showOverlay: true
                };

                // LISTENERS
                el.addEventListener('scanSuccess', (ev) => {
                    const results = ev.detail.recognizers.BlinkIdRecognizer;
                    if (results.resultState === 'Valid') {
                        let doc = results.documentNumber || results.mrz.documentNumber || results.mrz.primaryId;
                        if(doc) {
                            let cedula = doc.replace(/[^0-9]/g, '');
                            if(cedula.length > 5) {
                                // DETENER Y PROCESAR
                                cerrarCamara();
                                verificarCedula(cedula);
                            }
                        }
                    }
                });

                el.addEventListener('fatalError', (ev) => {
                    alert("Error: " + ev.detail.message);
                    cerrarCamara();
                });

                el.addEventListener('scanError', (ev) => {
                     if(ev.detail.code === "LicenseError") alert("Error de Licencia con el dominio.");
                });

                // Hack para forzar renderizado
                status.innerText = "🎥 Solicitando Permiso de Cámara...";
                
                // Esperamos un momento para que el componente monte
                setTimeout(() => {
                    status.style.display = 'none'; 
                }, 3000);

            } catch (e) {
                alert("Error al iniciar: " + e.message);
                cerrarCamara();
            }
        }

        function cerrarCamara() {
            document.getElementById('camera-layer').style.display = 'none';
            document.getElementById('ui-layer').style.display = 'block';
            // Recargar para limpiar memoria es recomendable en móviles
             location.reload(); 
        }

        // --- CONEXION API ---
        async function login() {
            const u = document.getElementById('l-user').value;
            const p = document.getElementById('l-pass').value;
            const res = await fetch(API + '/api/login', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify({usuario:u, password:p})
            });
            const data = await res.json();
            if(data.exito) {
                currentUser = data.usuario;
                localStorage.setItem('user', JSON.stringify(currentUser));
                document.getElementById('u-name').innerText = currentUser.nombres;
                verMenu();
            } else {
                document.getElementById('l-msg').style.display = 'block';
            }
        }

        async function guardar() {
            const data = {
                nombre: document.getElementById('r-nom').value,
                num_doc: document.getElementById('r-ced').value,
                responsable_id: currentUser.id
            };
            await fetch(API+'/api/crear_referido', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify(data)
            });
            alert('Guardado');
            document.getElementById('r-ced').value = '';
            verMenu();
        }

        async function cargarStats() {
            const res = await fetch(API+'/api/dashboard/stats');
            const d = await res.json();
            document.getElementById('st-total').innerText = d.total;
            document.getElementById('st-votos').innerText = d.votos;
        }

        async function verificarCedula(cedula) {
            const modal = document.getElementById('modal');
            const box = document.getElementById('modal-box');
            modal.style.display = 'flex';
            box.innerHTML = '<h3>Consultando '+cedula+'...</h3>';

            const res = await fetch(API+'/api/verificar/'+cedula);
            const d = await res.json();

            if(d.estado === 'NUEVO') {
                box.innerHTML = '<h1 style="color:red">X</h1><h3>NO REGISTRADO</h3><button class="btn btn-red" onclick="closeModal()">CERRAR</button>';
            } else if (d.estado === 'YA_VOTO') {
                box.innerHTML = '<h1 style="color:orange">⚠️</h1><h3>YA VOTÓ</h3><p>Responsable: '+d.datos.nombre_coordinador+'</p><button class="btn btn-blue" onclick="closeModal()">CERRAR</button>';
            } else {
                await fetch(API+'/api/referidos/votar/'+cedula, {method:'PUT'});
                box.innerHTML = '<h1 style="color:green">✅</h1><h3>VOTO EXITOSO</h3><p>'+d.datos.nombre_completo+'</p><button class="btn btn-green" onclick="closeModal()">ACEPTAR</button>';
            }
        }

        function closeModal() { document.getElementById('modal').style.display = 'none'; }
        function logout() { localStorage.clear(); location.reload(); }

        // Auto login
        window.onload = () => {
            if(localStorage.getItem('user')) {
                currentUser = JSON.parse(localStorage.getItem('user'));
                document.getElementById('u-name').innerText = currentUser.nombres;
                verMenu();
            }
        }
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
