import { useState } from 'react';
import { normalizarCodigo, consultarLote } from './loteService';
import { formatoFecha, condicionLegible, acortarDireccion, decodificarCodigo } from './format';
import { CONTRACT_ADDRESS, traza, conectarWallet } from './contract';
import { formatEther } from 'ethers';

function Icono({ nombre, ...props }) {
  const trazos = {
    cruz: <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />,
    buscar: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    wallet: <><path d="M20 8V5H5a2 2 0 0 0 0 4h16v11H5a2 2 0 0 1-2-2V7" /><path d="M21 12h-6v5h6" /></>,
    caja: <><path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5" /></>,
    escudo: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8 12 3 3 5-6" /></>,
    ruta: <><circle cx="5" cy="5" r="2" /><circle cx="19" cy="19" r="2" /><path d="M7 5h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h9" /></>,
    actividad: <path d="M2 12h5l3-8 4 16 3-8h5" />,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{trazos[nombre]}</svg>;
}

function parsearCondicion(condicionCruda) {
  let texto = '';
  try {
    texto = condicionLegible(condicionCruda) || '';
  } catch {
    texto = String(condicionCruda || '');
  }
  if (typeof texto === 'string' && texto.includes('|')) {
    const partes = texto.split('|');
    const alerta = partes[0] || 'ALERTA';
    let temp = '?', acel = '?', mov = '?';
    for (const p of partes) {
      if (typeof p !== 'string') continue;
      if (p.charAt(0) === 'T') temp = p.slice(1);
      else if (p.charAt(0) === 'A') acel = p.slice(1);
      else if (p.charAt(0) === 'M') mov = p.slice(1);
    }
    return { tipo: 'sensores', alerta, temp, acel, mov, esAlerta: true };
  }
  const t = String(texto);
  const esAlerta = t !== 'OK' && t !== 'ENTREGADO-OK';
  const etiqueta = t === 'DANADO' ? 'DAÑADO' : t;
  return { tipo: 'simple', etiqueta, esAlerta };
}

export default function App() {
  const [codigoInput, setCodigoInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);

  const [wallet, setWallet] = useState(null);
  const [pago, setPago] = useState(null);
  const [txMsg, setTxMsg] = useState(null);
  const [liberando, setLiberando] = useState(false);

  async function buscar(event) {
    event.preventDefault();
    setError(null);
    setResultado(null);
    setPago(null);
    setTxMsg(null);
    try {
      setCargando(true);
      const codigo = normalizarCodigo(codigoInput);
      const datos = await consultarLote(codigo);
      if (!datos.lote) {
        setError(`El lote ${codigoInput} no está registrado en la cadena.`);
        return;
      }
      setResultado({ ...datos, codigoBytes: codigo });
      // Leer estado del pago
      const est = await traza.estadoPago(codigo);
      setPago({ tuvoDano: est[0], pagoLiberado: est[1], montoEscrow: est[2] });
    } catch (err) {
      const mensaje = err?.reason ?? err?.message ?? String(err);
      setError(/network|connection|fetch|timeout|json-rpc|not found|ECONN/i.test(mensaje)
        ? 'No se pudo conectar a la red. Revisa tu conexión y vuelve a intentarlo.'
        : mensaje);
    } finally {
      setCargando(false);
    }
  }

  async function handleConectar() {
    try {
      const { direccion } = await conectarWallet();
      setWallet(direccion);
      setTxMsg(null);
    } catch (e) {
      setTxMsg({ tipo: 'error', texto: e.message });
    }
  }

  async function handleLiberarPago() {
    if (!wallet) {
      setTxMsg({ tipo: 'error', texto: 'Conecta tu wallet primero.' });
      return;
    }
    try {
      setLiberando(true);
      setTxMsg({ tipo: 'info', texto: 'Confirma la transacción en MetaMask…' });
      const { contratoConFirma } = await conectarWallet();
      const tx = await contratoConFirma.confirmarEntrega(resultado.codigoBytes);
      setTxMsg({ tipo: 'info', texto: 'Liberando pago… esperando confirmación.' });
      await tx.wait();
      setTxMsg({ tipo: 'ok', texto: '✅ Pago liberado al fabricante correctamente.' });
      // refrescar estado
      const est = await traza.estadoPago(resultado.codigoBytes);
      setPago({ tuvoDano: est[0], pagoLiberado: est[1], montoEscrow: est[2] });
    } catch (e) {
      const msg = e?.reason ?? e?.shortMessage ?? e?.message ?? String(e);
      setTxMsg({ tipo: 'error', texto: `No se pudo liberar: ${msg}` });
    } finally {
      setLiberando(false);
    }
  }

  const eventosOrdenados = resultado?.eventos
    ? resultado.eventos.map((ev, i) => ({ ev, i })).reverse().slice(0, 10)
    : [];

  return (
    <div className="contenedor">
      <header className="topbar">
        <a className="marca" href="#"><span className="marca-icono"><Icono nombre="cruz" /></span><span>Traza<span className="marca-acento">Med</span><small>TRAZABILIDAD FARMACÉUTICA</small></span></a>
        <div className="topbar-acciones">
          <span className="red-badge"><span className="estado-punto" />HashKey Testnet</span>
          {wallet
            ? <span className="wallet-conectada" title={wallet}><span className="estado-punto" />{acortarDireccion(wallet)}</span>
            : <button className="btn-wallet" onClick={handleConectar}><Icono nombre="wallet" />Conectar wallet</button>}
        </div>
      </header>
      <main id="contenido">
      <section className="encabezado">
        <div className="hero-texto">
          <span className="eyebrow"><span className="estado-punto" /> TRANSPARENCIA EN CADA ETAPA</span>
          <h1>Cada medicamento.<br /><span>Una historia verificable.</span></h1>
          <p className="subtitulo">Sigue el recorrido de tus medicamentos, verifica su integridad y consulta cada registro de su cadena de custodia.</p>
          <div className="hero-nota"><Icono nombre="escudo" />Trazabilidad respaldada por blockchain</div>
        </div>
        <div className="recorrido" aria-label="Etapas de la cadena de custodia: origen, transporte y entrega">
          <div className="recorrido-cabecera"><span>CADENA DE CUSTODIA</span><Icono nombre="ruta" /></div>
          <div className="recorrido-pasos">
            <div><span className="paso-icono"><Icono nombre="caja" /></span><strong>Origen</strong><small>Fabricante</small></div>
            <span className="paso-conector" />
            <div><span className="paso-icono"><Icono nombre="ruta" /></span><strong>Transporte</strong><small>Seguimiento</small></div>
            <span className="paso-conector" />
            <div><span className="paso-icono"><Icono nombre="escudo" /></span><strong>Entrega</strong><small>Verificación</small></div>
          </div>
          <div className="recorrido-nota">Un recorrido conectado. Un registro compartido.</div>
        </div>
      </section>
      <form className="buscador" onSubmit={buscar} aria-busy={cargando}>
        <div className="seccion-titulo"><span className="titulo-icono"><Icono nombre="buscar" /></span><div><h2>Consulta un lote</h2><p>La información de tu medicamento, en un solo lugar.</p></div><span className="consulta-badge">CONSULTA PÚBLICA</span></div>
        <label htmlFor="codigo">Código del lote (UID del tag RFID)</label>
        <div className="fila-buscador">
          <input id="codigo" type="text" value={codigoInput}
            onChange={(e) => setCodigoInput(e.target.value)}
            placeholder="Ej. LOTE-VACUNA-001" autoComplete="off" spellCheck="false" aria-describedby="codigo-ayuda" />
          <button type="submit" disabled={cargando}>
            {cargando ? <span className="spinner" /> : <Icono nombre="buscar" />}{cargando ? 'Consultando…' : 'Consultar lote'}
          </button>
        </div>
        <p id="codigo-ayuda" className="campo-ayuda">Introduce el identificador del lote para consultar sus registros. No necesitas conectar una wallet.</p>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {txMsg && !pago && <div className={`tx-msg ${txMsg.tipo}`} role="status">{txMsg.texto}</div>}
      {cargando && <div className="estado-consulta" role="status"><span className="spinner" />Consultando los registros del lote en la cadena…</div>}
      {!resultado && !cargando && (
        <section className="estado-inicial">
          <span className="vacio-icono"><Icono nombre="caja" width="30" height="30" /></span>
          <h2>El recorrido comienza con un código</h2>
          <p>Consulta un lote para ver su historial, las condiciones de transporte y el estado de su pago.</p>
          <div className="funciones">
            <span><Icono nombre="ruta" />Historial de custodia</span>
            <span><Icono nombre="actividad" />Condiciones del transporte</span>
            <span><Icono nombre="escudo" />Estado del pago</span>
          </div>
        </section>
      )}

      {resultado?.lote && (
        <section className="lote">
          <div className="lote-header">
            <div>
              <h2>{decodificarCodigo(resultado.codigo)}</h2>
              <span className="lote-sub">{resultado.eventos.length} registros en cadena</span>
            </div>
            <div className="lote-meta">
              <span className="meta-label">Fabricante</span>
              <code>{acortarDireccion(resultado.lote.fabricante)}</code>
            </div>
          </div>

          {pago && (
            <div className={`pago-card ${pago.pagoLiberado ? 'pago-liberado' : pago.tuvoDano ? 'pago-retenido' : 'pago-pendiente'}`}>
              <div className="pago-titulo">Estado del pago (Escrow)</div>
              {pago.pagoLiberado ? (
                <div className="pago-estado ok">✅ Pago liberado al fabricante — entrega verificada.</div>
              ) : pago.tuvoDano ? (
                <div className="pago-estado danger">⚠️ Pago RETENIDO — se detectaron daños en el transporte. El contrato bloquea la liberación.</div>
              ) : (
                <>
                  <div className="pago-estado pend">
                    💰 Escrow retenido: {formatEther(pago.montoEscrow)} HSK — sin daños detectados.
                  </div>
                  <button className="btn-liberar" onClick={handleLiberarPago} disabled={liberando}>
                    {liberando ? 'Procesando…' : 'Confirmar entrega y liberar pago'}
                  </button>
                </>
              )}
              {txMsg && <div className={`tx-msg ${txMsg.tipo}`} role="status">{txMsg.texto}</div>}
            </div>
          )}

          <div className="historial-titulo"><h2>Historial de custodia</h2><span>Últimos {eventosOrdenados.length} registros</span></div>
          {eventosOrdenados.length === 0 && <p className="sin-eventos">Este lote todavía no tiene eventos de custodia registrados.</p>}
          <div className="timeline">
            {eventosOrdenados.map(({ ev, i }, pos) => {
              const cond = parsearCondicion(ev.condicion);
              const esUltimo = pos === 0;
              return (
                <div key={i} className={`evento ${cond.esAlerta ? 'evento-alerta' : 'evento-ok'} ${esUltimo ? 'evento-ultimo' : ''}`}>
                  <div className="evento-linea"><div className="evento-punto"></div></div>
                  <div className="evento-card">
                    <div className="evento-top">
                      <span className="evento-num">#{i + 1}</span>
                      {esUltimo && <span className="badge-ultimo">ÚLTIMO</span>}
                      <span className="evento-fecha">{formatoFecha(ev.timestamp)}</span>
                    </div>
                    {cond.tipo === 'sensores' ? (
                      <>
                        <div className={`evento-alerta-tag ${cond.esAlerta ? 'tag-rojo' : ''}`}>{cond.alerta}</div>
                        <div className="sensores">
                          <div className="sensor"><span className="sensor-icono">🌡️</span><span className="sensor-valor">{cond.temp}°C</span><span className="sensor-label">Temperatura</span></div>
                          <div className="sensor"><span className="sensor-icono">📊</span><span className="sensor-valor">{cond.acel}</span><span className="sensor-label">Aceleración</span></div>
                          <div className="sensor"><span className="sensor-icono">🚶</span><span className="sensor-valor">{cond.mov === '0' ? 'No' : 'Sí'}</span><span className="sensor-label">Movimiento</span></div>
                        </div>
                      </>
                    ) : (
                      <div className={`evento-simple ${cond.esAlerta ? 'tag-rojo' : 'tag-verde'}`}>{cond.etiqueta}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      </main>
      <footer className="pie">
        <span><Icono nombre="cruz" />TrazaMed <span className="pie-red">/ HashKey Chain Testnet</span></span>
        <span className="pie-contrato">Contrato <code>{CONTRACT_ADDRESS}</code></span>
      </footer>
    </div>
  );
}