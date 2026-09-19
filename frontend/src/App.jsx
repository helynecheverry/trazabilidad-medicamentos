import { useState, useEffect } from 'react';
import { normalizarCodigo, consultarLote } from './loteService';
import { formatoFecha, condicionLegible, acortarDireccion, decodificarCodigo } from './format';
import { CONTRACT_ADDRESS, traza, conectarWallet } from './contract';
import { formatEther } from 'ethers';

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
      <header className="encabezado">
        <div className="topbar">
          {wallet
            ? <span className="wallet-conectada">🟢 {acortarDireccion(wallet)}</span>
            : <button className="btn-wallet" onClick={handleConectar}>Conectar Wallet</button>}
        </div>
        <h1>Trazabilidad de Medicamentos</h1>
        <p className="subtitulo">
          Cadena de custodia, integridad y pago verificado en HashKey Chain Testnet.
        </p>
      </header>

      <form className="buscador" onSubmit={buscar}>
        <label htmlFor="codigo">Código del lote (UID del tag RFID)</label>
        <div className="fila-buscador">
          <input id="codigo" type="text" value={codigoInput}
            onChange={(e) => setCodigoInput(e.target.value)}
            placeholder="LOTE-VACUNA-001" autoComplete="off" spellCheck="false" />
          <button type="submit" disabled={cargando}>
            {cargando ? 'Consultando…' : 'Consultar'}
          </button>
        </div>
      </form>

      {error && <p className="error">{error}</p>}

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
              {txMsg && <div className={`tx-msg ${txMsg.tipo}`}>{txMsg.texto}</div>}
            </div>
          )}

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

      <footer className="pie">
        Red: HashKey Chain Testnet · Contrato: <code>{CONTRACT_ADDRESS}</code>
      </footer>
    </div>
  );
}