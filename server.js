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
// V17: ESCÁNER MULTIFORMATO (BARRAS + PDF417)
// =================================================================
const APP_HTML = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Sistema Electoral</title>
    
    <script src="https://unpkg.com/html5-qrcode" type="text/javascript"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    
    <style>
        body, html { height: 100%; margin: 0; padding: 0; font-family: sans-serif; background: #000; overflow: hidden; }

        /* UI LAYERS */
        #layer-ui { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #f4f7f6; z-index: 10; overflow-y: auto; }
        #layer-camera { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #000; z-index: 20; display: none; flex-direction: column; }

        /* CARDS */
        .card { background: white; width: 90%; max-width: 400px; padding: 20px; border-radius: 12px; margin: 20px auto; text-align: center; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .btn { width: 100%; padding: 15px; border: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 10px; color: white; cursor: pointer; }
        .btn-green { background: #28a745; }
        .btn-blue { background: #003366; }
        input { width: 100%; padding: 12px; margin-bottom: 10px; text-align: center; border: 1px solid #ddd; border-radius: 5px; }

        /* SCANNER AREA */
        #reader { width: 100%; height: 100%; background: black; }
        
        /* GUIAS VISUALES */
        .scan-header { position: absolute; top: 0; left: 0; width: 100%; padding: 15px; display: flex; justify-content: space-between; z-index: 30; background: rgba(0,0,0,0.5); color: white; }
        
        .scan-box-guide {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 80%; height: 150px; border: 2px solid #28a745; 
            box-shadow: 0 0 0 9999px rgba(0,0,0,0.5);
            z-index: 25; pointer-events: none; border-radius: 10px;
        }
        .scan-line {
            width: 100%; height: 2px; background: red; position: absolute; top: 50%;
            animation: scanAnim 2s infinite;
        }
        @keyframes scanAnim { 0% {top:10%} 50% {top:90%} 100% {top:10%} }

        .scan-instruction { position: absolute; bottom: 80px; width: 100%; text-align: center; color: white; font-weight: bold; z-index: 30; text-shadow: 1px 1px 2px black; }

        /* MODAL */
        #modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 100; display: none; align-items: center; justify-content: center; }
        #modal-box { background: white; padding: 25px; border-radius: 10px; width: 85%; max-width: 350px; text-align: center; }
    </style>
</head>
<body>

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
            <div style="background:#003366; color:white; padding:15px; position:fixed; top:0; left:0; width:100%; z-index:100; display:flex; justify-content:space-between;">
                <b id="u-name">Usuario</b> <span onclick="logout()">SALIR</span>
            </div>
            
            <div class="card" onclick="irRegistro()"><h3>📝 REGISTRO MANUAL</h3></div>
            
            <div class="card" onclick="activarCamara()" style="border: 3px solid #28a745;">
                <h3 style="color:#28a745">📷 ESCANEAR CÉDULA</h3>
                <p>Apunta al Código de Barras</p>
            </div>
            
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
        <div class="scan-header">
            <span>Escáner V17</span>
            <button onclick="cerrarCamara()" style="background:white; color:black; border:none; padding:5px 15px; border-radius:15px;">X</button>
        </div>
        
        <div id="reader"></div>
        
        <div class="scan-box-guide">
            <div class="scan-line"></div>
        </div>
        
        <div class="scan-instruction">
            CENTRA EL CÓDIGO DE BARRAS<br>EN EL RECUADRO VERDE
        </div>
    </div>

    <div id="modal-overlay"><div id="modal-box"></div></div>

    <script>
        const API = window.location.origin;
        let currentUser = null;
        let html5QrCode;

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

        // --- CÁMARA MULTIFORMATO ---
        function activarCamara() {
            document.getElementById('layer-ui').style.display = 'none';
            document.getElementById('layer-camera').style.display = 'flex';
            
            html5QrCode = new Html5Qrcode("reader");
            
            // CONFIGURACIÓN CLAVE: RECTANGULO + BARRAS
            const config = { 
                fps: 15, // Más rápido
                qrbox: { width: 300, height: 150 }, // Rectangular para barras
                aspectRatio: 1.0,
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true
                }
            };
            
            // Nota: Html5Qrcode por defecto escanea TODO si no se limita.
            // Con useBarCodeDetectorIfSupported intentamos usar el hardware del celular.

            html5QrCode.start(
                { facingMode: "environment" }, 
                config, 
                onScanSuccess, 
                onScanFailure
            ).catch(err => {
                alert("Error: " + err);
                cerrarCamara();
            });
        }

        function onScanSuccess(decodedText, decodedResult) {
            console.log("Detectado: " + decodedText);
            
            // FILTRO INTELIGENTE PARA CEDULAS
            // Buscamos cualquier secuencia numérica larga
            let numbers = decodedText.match(/\\d+/g);
            
            if (numbers) {
                // Filtramos números que parezcan cédulas (entre 6 y 10 dígitos)
                // Ignoramos números cortos o códigos de barras de productos (13 digitos) si es posible
                let cedula = numbers.find(n => n.length >= 6 && n.length <= 10 && parseInt(n) > 100000);
                
                if(cedula) {
                    html5QrCode.stop().then(() => {
                        verificarCedula(cedula);
                    });
                }
            }
        }

        function onScanFailure(error) {
            // Sigue intentando...
        }

        function cerrarCamara() {
            if(html5QrCode) {
                html5QrCode.stop().then(() => {
                    document.getElementById('layer-camera').style.display = 'none';
                    document.getElementById('layer-ui').style.display = 'block';
                    html5QrCode.clear();
                }).catch(err => location.reload());
            } else {
                location.reload();
            }
        }

        // --- NEGOCIO ---
        async function verificarCedula(cedula) {
            const box = document.getElementById('modal-box');
            document.getElementById('modal-overlay').style.display = 'flex';
            
            // PREGUNTA DE SEGURIDAD
            box.innerHTML = \`
                <h3>Cédula Detectada</h3>
                <h1 style="font-size:2.5rem; margin:10px 0;">\${cedula}</h1>
                <p>¿Es correcta?</p>
                <button class="btn btn-green" onclick="procesarVerdadera('\${cedula}')">SÍ, VERIFICAR</button>
                <button class="btn btn-red" onclick="cerrarModalCam()">NO, REINTENTAR</button>
            \`;
        }
        
        function cerrarModalCam() {
             document.getElementById('modal-overlay').style.display = 'none';
             activarCamara(); 
        }

        async function procesarVerdadera(cedula) {
            const box = document.getElementById('modal-box');
            box.innerHTML = '<h3>⏳ Consultando BD...</h3>';
            
            try {
                const res = await fetch(API+'/api/verificar/'+cedula);
                const d = await res.json();

                if(d.estado === 'NUEVO') {
                    box.innerHTML = '<h1 style="color:red; font-size:3rem;">X</h1><h3>NO ESTÁ EN LISTA</h3><button class="btn btn-blue" onclick="cerrarTodo()">ACEPTAR</button>';
                } else if(d.estado === 'YA_VOTO') {
                    box.innerHTML = '<h1 style="color:orange; font-size:3rem;">⚠️</h1><h3>YA VOTÓ</h3><p>Responsable: '+d.datos.nombre_coordinador+'</p><button class="btn btn-blue" onclick="cerrarTodo()">ACEPTAR</button>';
                } else {
                    await fetch(API+'/api/referidos/votar/'+cedula, {method:'PUT'});
                    box.innerHTML = '<h1 style="color:green; font-size:3rem;">✅</h1><h3>REGISTRADO</h3><p>'+d.datos.nombre_completo+'</p><p>Mesa: '+d.datos.mesa_votacion+'</p><button class="btn btn-blue" onclick="cerrarTodo()">ACEPTAR</button>';
                }
            } catch(e) {
                alert("Error de red");
                cerrarTodo();
            }
        }
        
        function cerrarTodo() {
            document.getElementById('modal-overlay').style.display = 'none';
            document.getElementById('layer-camera').style.display = 'none';
            document.getElementById('layer-ui').style.display = 'block';
            cargarStats();
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

        window.onload = checkSession;
    </script>
</body>
</html>
`;

// API
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
