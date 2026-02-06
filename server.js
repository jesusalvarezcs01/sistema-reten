const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios'); // NECESARIO PARA EL TRUCO (Ya viene en Render usualmente)

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// =================================================================
// 1. TRUCO DE PROXY (BACKEND DESCARGA LOS ARCHIVOS)
// =================================================================
// Esto engaña al celular para que crea que los archivos son locales
app.get('/resources/:file', async (req, res) => {
    const fileName = req.params.file;
    const remoteUrl = `https://cdn.jsdelivr.net/npm/@microblink/blinkid-in-browser-sdk@6.1.0/resources/${fileName}`;
    
    try {
        // El servidor descarga el archivo por ti
        const response = await axios.get(remoteUrl, { responseType: 'arraybuffer' });
        
        // Se lo entregamos al celular con los permisos correctos
        res.set('Content-Type', response.headers['content-type']);
        res.set('Access-Control-Allow-Origin', '*');
        res.send(response.data);
    } catch (error) {
        res.status(404).send("Error proxy: " + error.message);
    }
});

// =================================================================
// 2. INTERFAZ GRÁFICA (V14)
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
        body, html { height: 100%; margin: 0; padding: 0; font-family: sans-serif; background: #000; overflow: hidden; }

        /* CAPAS */
        #layer-ui { position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow-y: auto; z-index: 10; background: #f4f7f6; }
        #layer-camera { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #000; z-index: 9999; display: none; flex-direction: column; }

        /* UI */
        .card { background: white; width: 90%; max-width: 400px; padding: 20px; border-radius: 12px; margin: 20px auto; text-align: center; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .btn { width: 100%; padding: 15px; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 10px; color: white; cursor: pointer; }
        .btn-green { background: #28a745; }
        .btn-blue { background: #003366; }
        input { width: 100%; padding: 12px; margin-bottom: 10px; text-align: center; border: 1px solid #ddd; border-radius: 5px; box-sizing: border-box; }

        /* HEADER CAMARA */
        .cam-header { position: absolute; top: 0; left: 0; width: 100%; height: 60px; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: space-between; padding: 0 15px; box-sizing: border-box; color: white; }

        blinkid-in-browser { width: 100%; height: 100%; display: block; }

        /* LOADING */
        #loader {
            position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%);
            color: white; z-index: 9000; text-align: center; pointer-events: none;
        }

        /* MODAL */
        #modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 20000; display: none; align-items: center; justify-content: center; }
        #modal-box { background: white; padding: 25px; border-radius: 10px; width: 85%; max-width: 350px; text-align: center; }
    </style>
</head>
<body>

    <script>
        const LICENCIA = "sRwCABpzaXN0ZW1hLXJldGVuLm9ucmVuZGVyLmNvbQZsZXlKRGNtVmhkR1ZrVDI0aU9qRTNOekF6TkRBNE56UXhORE1zSWtOeVpXRjBaV1JHYjNJaU9pSmhOVFkyT1RNeFppMWpNbVEyTFRRMk1UY3RZalF3T0MwM09Ea3dNVFJrT0RFMVpqQWlmUT09Xx8uagCPC8T3b3Qa3oHIoGgMBAgsat/gyX1+szaTbpLSxKbea+5LfnKoV2qjcJo5KX2BZfrFUBxFP093X0F3XpjecVfoJx+llc9E4c5k8MBT59V+d+ll6wtjn1EnjA==";
    </script>

    <div id="layer-ui">
        <div id="view-login" style="height: 100vh; display: flex; align-items: center; justify-content: center; background: #003366;">
            <div class="card">
                <h2>CONTROL ELECTORAL</h2>
                <input type="number" id="l-user" placeholder="Cédula">
                <input type="password" id="l-pass" placeholder="Contraseña">
                <button class="btn btn-green" onclick="doLogin()">ENTRAR</button>
            </div>
        </div>

        <div id="view-dashboard" style="display:none; padding-top: 60px;">
            <div style="background:#003366; color:white; padding:15px; position:fixed; top:0; left:0; width:100%; z-index:100; display:flex; justify-content:space-between; box-sizing:border-box;">
                <b id="u-name">Usuario</b> <span onclick="logout()">SALIR</span>
            </div>
            <div class="card" onclick="irRegistro()"><h3>📝 REGISTRO MANUAL</h3></div>
            <div class="card" onclick="activarCamara()" style="border: 3px solid #28a745;"><h3 style="color:#28a745">📷 ACTIVAR ESCÁNER</h3></div>
            <div class="card"><h3>Total: <span id="s-total">0</span> | Votos: <span id="s-votos">0</span></h3></div>
        </div>

        <div id="view-registro" style="display:none; padding-top:20px;">
            <div class="card">
                <h3>Nuevo</h3>
                <input type="text" id="r-nom" placeholder="Nombre"><input type="number" id="r-ced" placeholder="Cédula">
                <button class="btn btn-blue" onclick="guardar()">GUARDAR</button><button class="btn btn-red" onclick="verDashboard()">VOLVER</button>
            </div>
        </div>
    </div>

    <div id="layer-camera">
        <div class="cam-header">
            <b>Escáner V14 (Proxy)</b>
            <button onclick="cerrarCamara()" style="background:white; color:black; border:none; padding:5px 15px; border-radius:15px;">X</button>
        </div>
        
        <div id="loader">
            <i class="fas fa-circle-notch fa-spin fa-3x"></i><br><br>
            CARGANDO RECURSOS...
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

        async function activarCamara() {
            document.getElementById('layer-ui').style.display = 'none';
            document.getElementById('layer-camera').style.display = 'flex';
            document.getElementById('loader').style.display = 'block';
            
            try {
                // 1. Permiso Nativo
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                stream.getTracks().forEach(t => t.stop());
                
                // 2. Configurar SDK apuntando a NUESTRO PROPIO SERVIDOR
                const el = document.getElementById('scanner-el');
                el.licenseKey = LICENCIA;
                el.recognizers = ['BlinkIdRecognizer'];
                
                // MAGIA AQUI: Le decimos que los archivos están AQUI MISMO
                // El backend (/resources/) se encargará de buscarlos afuera
                el.engineLocation = window.location.origin + "/resources/";
                
                console.log("Cargando engine desde: " + el.engineLocation);

                el.addEventListener('scanSuccess', (ev) => {
                    const r = ev.detail.recognizers.BlinkIdRecognizer;
                    if (r.resultState === 'Valid') {
                         let doc = r.documentNumber || r.mrz.documentNumber;
                         if(doc) {
                             cerrarCamara();
                             verificarCedula(doc.replace(/[^0-9]/g, ''));
                         }
                    }
                });

                // Cuando carga, ocultar loader
                el.addEventListener('ready', () => {
                    document.getElementById('loader').style.display = 'none';
                });

                el.addEventListener('fatalError', (ev) => {
                    alert("Error SDK: " + ev.detail.message);
                    cerrarCamara();
                });

                el.addEventListener('scanError', (ev) => {
                    if(ev.detail.code === "LicenseError") alert("Error Licencia.");
                });

            } catch(e) {
                alert("No diste permiso de cámara.");
                cerrarCamara();
            }
        }

        function cerrarCamara() {
            document.getElementById('layer-camera').style.display = 'none';
            document.getElementById('layer-ui').style.display = 'block';
            location.reload(); 
        }

        async function doLogin() {
            const u = document.getElementById('l-user').value;
            const p = document.getElementById('l-pass').value;
            const res = await fetch(API+'/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({usuario:u, password:p})});
            const data = await res.json();
            if(data.exito) {
                localStorage.setItem('user', JSON.stringify(data.usuario));
                checkSession();
            } else alert('Error Login');
        }

        function checkSession() {
            const s = localStorage.getItem('user');
            if(s) {
                currentUser = JSON.parse(s);
                document.getElementById('u-name').innerText = currentUser.nombres;
                verDashboard();
            }
        }
        function logout() { localStorage.clear(); location.reload(); }

        async function guardar() {
            const data = { nombre: document.getElementById('r-nom').value, num_doc: document.getElementById('r-ced').value, responsable_id: currentUser.id };
            await fetch(API+'/api/crear_referido', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
            alert('Guardado'); document.getElementById('r-ced').value=''; verDashboard();
        }

        async function cargarStats() {
            const res = await fetch(API+'/api/dashboard/stats');
            const d = await res.json();
            document.getElementById('s-total').innerText = d.total;
            document.getElementById('s-votos').innerText = d.votos;
        }

        async function verificarCedula(cedula) {
            const ov = document.getElementById('modal-overlay');
            const box = document.getElementById('modal-box');
            ov.style.display = 'flex'; box.innerHTML = '<h3>Verificando '+cedula+'...</h3>';
            
            const res = await fetch(API+'/api/verificar/'+cedula);
            const d = await res.json();
            
            if(d.estado === 'NUEVO') box.innerHTML = '<h1 style="color:red">X</h1><h3>NO ESTÁ</h3><button class="btn btn-blue" onclick="location.reload()">OK</button>';
            else if(d.estado === 'YA_VOTO') box.innerHTML = '<h1 style="color:orange">⚠️</h1><h3>YA VOTÓ</h3><p>'+d.datos.nombre_coordinador+'</p><button class="btn btn-blue" onclick="location.reload()">OK</button>';
            else {
                await fetch(API+'/api/referidos/votar/'+cedula, {method:'PUT'});
                box.innerHTML = '<h1 style="color:green">✅</h1><h3>REGISTRADO</h3><p>'+d.datos.nombre_completo+'</p><button class="btn btn-blue" onclick="location.reload()">OK</button>';
            }
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
