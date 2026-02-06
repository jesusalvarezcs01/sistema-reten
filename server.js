const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
const https = require('https'); // Usamos nativo para no instalar nada

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// =================================================================
// 1. PROXY ESPEJO (LA CLAVE DEL ÉXITO)
// =================================================================
// Esto engaña al navegador para que crea que los archivos de Microblink son locales.
// Soluciona el error "Failed to execute importScripts".
app.get('/sdk-resources/:filename', (req, res) => {
    const filename = req.params.filename;
    // Apuntamos a la versión 5.8.0 que es muy estable
    const remoteUrl = `https://cdn.jsdelivr.net/npm/@microblink/blinkid-in-browser-sdk@5.8.0/resources/${filename}`;

    https.get(remoteUrl, (remoteRes) => {
        // Pasamos los encabezados correctos (importante para archivos .wasm)
        res.set('Content-Type', remoteRes.headers['content-type']);
        res.set('Cache-Control', 'public, max-age=31536000'); // Cachear para que sea rápido la próxima
        
        // Conectamos el tubo (pipe) directo
        remoteRes.pipe(res);
    }).on('error', (e) => {
        res.status(500).send("Error Proxy: " + e.message);
    });
});

// =================================================================
// 2. INTERFAZ GRÁFICA (V19)
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

        /* CAPAS DE LA APLICACIÓN */
        #layer-app { 
            position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
            background: #f4f7f6; z-index: 10; overflow-y: auto; 
        }
        
        #layer-scanner { 
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: #000; z-index: 9999; 
            display: none; /* Oculto por defecto */
            flex-direction: column;
        }

        /* COMPONENTES UI */
        .card { background: white; width: 90%; max-width: 400px; padding: 25px; border-radius: 15px; margin: 20px auto; text-align: center; box-shadow: 0 5px 20px rgba(0,0,0,0.1); }
        .btn { width: 100%; padding: 15px; border: none; border-radius: 10px; font-weight: bold; font-size: 16px; margin-top: 15px; color: white; cursor: pointer; }
        .btn-green { background: #28a745; box-shadow: 0 4px 0 #218838; }
        .btn-blue { background: #003366; box-shadow: 0 4px 0 #002244; }
        input { width: 100%; padding: 15px; margin-bottom: 10px; text-align: center; border: 1px solid #ccc; border-radius: 8px; font-size: 16px; background: #f9f9f9; }

        /* HEADER & NAVBAR */
        .navbar { background: #003366; color: white; padding: 15px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 10px rgba(0,0,0,0.2); }
        
        /* CONTROLES CAMARA */
        .scan-controls { 
            position: absolute; top: 0; left: 0; width: 100%; padding: 20px; 
            display: flex; justify-content: space-between; z-index: 10000; 
            background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent); 
        }
        .scan-msg {
            position: absolute; bottom: 50px; width: 100%; text-align: center; color: white;
            z-index: 10000; font-weight: bold; text-shadow: 0 2px 4px black; font-size: 1.2rem;
            pointer-events: none;
        }

        /* MICROBLINK COMPONENT */
        blinkid-in-browser { 
            width: 100%; height: 100%; display: block; background: black; 
        }

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
                <h2 style="color:#003366; margin-bottom: 5px;">CONTROL ELECTORAL</h2>
                <p style="color:#666; margin-bottom: 20px;">El Retén 2026</p>
                <input type="number" id="l-user" placeholder="Cédula Usuario">
                <input type="password" id="l-pass" placeholder="Contraseña">
                <button class="btn btn-green" onclick="doLogin()">INGRESAR AL SISTEMA</button>
            </div>
        </div>

        <div id="view-dashboard" style="display:none;">
            <div class="navbar">
                <div>👋 <b id="u-name">...</b></div>
                <div onclick="logout()" style="cursor:pointer; font-size: 0.9rem; opacity: 0.9;"><i class="fas fa-sign-out-alt"></i> SALIR</div>
            </div>
            
            <div style="padding: 20px;">
                <div class="card" onclick="irRegistro()">
                    <i class="fas fa-pen-square fa-3x" style="color:#003366; margin-bottom:10px;"></i>
                    <h3>REGISTRO MANUAL</h3>
                    <p style="color:#888;">Ingreso por teclado</p>
                </div>

                <div class="card" onclick="activarCamara()" style="border: 2px solid #28a745; transform: scale(1.02);">
                    <i class="fas fa-id-card fa-3x" style="color:#28a745; margin-bottom:10px;"></i>
                    <h3 style="color:#28a745;">ESCANEAR CÉDULA</h3>
                    <p style="color:#555;">Lee <b>PDF417</b> (Atrás) y <b>MRZ</b></p>
                    <button class="btn btn-green" style="margin-top:5px;">INICIAR CÁMARA</button>
                </div>

                <div class="card" style="background: #f8f9fa;">
                    <h3>ESTADÍSTICAS</h3>
                    <div style="display:flex; justify-content:space-around; margin-top:15px;">
                        <div><h2 id="s-total">0</h2><small>Total</small></div>
                        <div style="color:#28a745;"><h2 id="s-votos">0</h2><small>Votaron</small></div>
                    </div>
                </div>
            </div>
        </div>

        <div id="view-registro" style="display:none; padding-top:20px;">
            <div class="card">
                <h3>Nuevo Votante</h3>
                <input type="text" id="r-nom" placeholder="Nombre Completo">
                <input type="number" id="r-ced" placeholder="Cédula">
                <button class="btn btn-blue" onclick="guardar()">GUARDAR REGISTRO</button>
                <button class="btn btn-red" style="background:#dc3545;" onclick="verDashboard()">CANCELAR</button>
            </div>
        </div>
    </div>

    <div id="layer-scanner">
        <div class="scan-controls">
            <span style="color:white; font-weight:bold; text-shadow:0 1px 2px black;">ESCANEANDO...</span>
            <button onclick="cerrarCamara()" style="background:rgba(255,255,255,0.2); color:white; border:1px solid white; padding:5px 15px; border-radius:20px;">CERRAR</button>
        </div>
        
        <div id="loader" style="color:white; text-align:center; position:absolute; top:45%; width:100%; z-index:9000;">
            <i class="fas fa-circle-notch fa-spin fa-3x"></i><br><br>
            CARGANDO MOTOR IA...<br>
            <small>(Esto puede tardar un poco la primera vez)</small>
        </div>

        <blinkid-in-browser id="scanner-el"></blinkid-in-browser>
        
        <div class="scan-msg">
            Muestra la parte de ATRÁS de la cédula
        </div>
    </div>

    <div id="modal-overlay"><div id="modal-box"></div></div>

    <script>
        const API = window.location.origin;
        let currentUser = null;

        // --- GESTIÓN DE PANTALLAS ---
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

        // --- CÁMARA MICROBLINK (CONFIGURACIÓN MAESTRA) ---
        async function activarCamara() {
            // 1. Ocultar la App para evitar conflictos de renderizado
            document.getElementById('layer-app').style.display = 'none';
            document.getElementById('layer-scanner').style.display = 'flex';
            document.getElementById('loader').style.display = 'block';

            try {
                const el = document.getElementById('scanner-el');
                
                // Si ya se inicializó antes, no recargar todo
                if (el.blinkId) {
                    document.getElementById('loader').style.display = 'none';
                    return; 
                }

                // CONFIGURACIÓN DE RECURSOS (EL SECRETO)
                el.licenseKey = LICENCIA;
                
                // Aquí usamos nuestro PROXY LOCAL para que el celular no bloquee los archivos
                el.engineLocation = window.location.origin + "/sdk-resources/"; 
                
                // Reconocedor Universal (PDF417 + MRZ)
                el.recognizers = ['BlinkIdRecognizer']; 
                
                // Configuraciones de UI para que ocupe todo y sea rápido
                el.uiSettings = { 
                    enableFullScreen: true, // Dejamos que Microblink maneje el fullscreen
                    showOverlay: true,
                    timeout: 25000 // Dar tiempo si el internet es lento
                };

                // EVENTOS
                el.addEventListener('scanSuccess', (ev) => {
                    const results = ev.detail.recognizers.BlinkIdRecognizer;
                    
                    if (results.resultState === 'Valid') {
                        // Extraer Número de Documento (Prioridad MRZ, luego Codigo Barras)
                        const docNumber = 
                            results.documentNumber || 
                            results.mrz.documentNumber || 
                            results.mrz.primaryId ||
                            results.barcode.data; // A veces viene aquí en PDF417 raw

                        if(docNumber) {
                            // Limpiamos el numero (solo digitos)
                            let cedula = docNumber.replace(/[^0-9]/g, '');
                            
                            // Validar longitud razonable para Colombia (6 a 10 digitos)
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

                // Cuando el motor esté listo
                el.addEventListener('ready', () => {
                    document.getElementById('loader').style.display = 'none';
                });

            } catch(e) {
                alert("Error al iniciar cámara: " + e.message);
                cerrarCamara();
            }
        }

        function cerrarCamara() {
            document.getElementById('layer-scanner').style.display = 'none';
            document.getElementById('layer-app').style.display = 'block';
            // Recargar para limpiar memoria es vital en móviles con cámaras pesadas
            setTimeout(() => location.reload(), 300);
        }

        // --- LÓGICA DE NEGOCIO ---
        async function verificarCedula(cedula) {
            const ol = document.getElementById('modal-overlay');
            const box = document.getElementById('modal-box');
            ol.style.display = 'flex';
            box.innerHTML = '<h3><i class="fas fa-spinner fa-spin"></i> Verificando '+cedula+'...</h3>';

            try {
                const res = await fetch(API+'/api/verificar/'+cedula);
                const d = await res.json();

                if(d.estado === 'NUEVO') {
                    box.innerHTML = '<i class="fas fa-times-circle" style="color:red; font-size:3rem;"></i><h3 style="color:red">NO REGISTRADO</h3><p>La cédula '+cedula+' no está en base de datos.</p><button class="btn btn-blue" onclick="location.reload()">ACEPTAR</button>';
                } else if(d.estado === 'YA_VOTO') {
                    box.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:orange; font-size:3rem;"></i><h3 style="color:orange">YA VOTÓ</h3><p>Líder: '+d.datos.nombre_coordinador+'</p><button class="btn btn-blue" onclick="location.reload()">ACEPTAR</button>';
                } else {
                    await fetch(API+'/api/referidos/votar/'+cedula, {method:'PUT'});
                    box.innerHTML = '<i class="fas fa-check-circle" style="color:green; font-size:3rem;"></i><h3 style="color:green">VOTO EXITOSO</h3><p><b>'+d.datos.nombre_completo+'</b><br>Mesa: '+d.datos.mesa_votacion+'</p><button class="btn btn-blue" onclick="location.reload()">CONTINUAR</button>';
                }
            } catch(e) {
                alert("Error de conexión");
                location.reload();
            }
        }

        // --- SISTEMA DE SESIÓN ---
        async function doLogin() {
            const u = document.getElementById('l-user').value;
            const p = document.getElementById('l-pass').value;
            
            try {
                const res = await fetch(API+'/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({usuario:u, password:p})});
                const data = await res.json();
                
                if(data.exito) {
                    localStorage.setItem('user', JSON.stringify(data.usuario));
                    checkSession();
                } else {
                    alert('Credenciales incorrectas');
                }
            } catch(e) { alert("Error de red"); }
        }

        function checkSession() {
            const s = localStorage.getItem('user');
            if(s) {
                currentUser = JSON.parse(s);
                document.getElementById('view-login').style.display = 'none';
                document.getElementById('u-name').innerText = currentUser.nombres.split(' ')[0];
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
  try {
      const r = await pool.query('SELECT * FROM usuarios WHERE numero_documento = $1 AND password = $2', [usuario, password]);
      if(r.rows.length > 0) res.json({exito:true, usuario:r.rows[0]});
      else res.json({exito:false});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('/api/dashboard/stats', async (req, res) => {
  try {
      const t = await pool.query('SELECT COUNT(*) FROM referidos');
      const v = await pool.query('SELECT COUNT(*) FROM referidos WHERE estado_voto = true');
      res.json({ total: t.rows[0].count, votos: v.rows[0].count });
  } catch(e) { res.json({total:0, votos:0}); }
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
  try {
      const { cedula } = req.params;
      const r = await pool.query(`SELECT r.*, u.nombres as nombre_coordinador FROM referidos r JOIN usuarios u ON r.responsable_id = u.id WHERE r.numero_documento = $1`, [cedula]);
      if (r.rows.length === 0) return res.json({ estado: 'NUEVO' });
      if (r.rows[0].estado_voto) return res.json({ estado: 'YA_VOTO', datos: r.rows[0] });
      return res.json({ estado: 'REGISTRADO', datos: r.rows[0] });
  } catch(e) { res.json({estado:'ERROR'}); }
});

app.put('/api/referidos/votar/:cedula', async (req, res) => {
  try {
      await pool.query('UPDATE referidos SET estado_voto = true WHERE numero_documento = $1', [req.params.cedula]);
      res.json({ exito: true });
  } catch(e) { res.json({exito:false}); }
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
