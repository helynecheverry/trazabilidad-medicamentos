import { useState } from 'react';
import { normalizarCodigo, consultarLote } from './loteService';
import { formatoFecha, condicionLegible, acortarDireccion, decodificarCodigo } from './format';
import { CONTRACT_ADDRESS } from './contract';

function parsearCondicion(condicionCruda) {
  let texto = '';
  try {
    texto = condicionLegible(condicionCruda) || '';
  } catch {
    texto = String(condicionCruda || '');
  }

  // Formato empaquetado: ALERTA|T..|A..|M..
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
  const esAlerta = t !== 'OK';
  const etiqueta = t === 'DANADO' ? 'DAÑADO' : t;
  return { tipo: 'simple', etiqueta, esAlerta };
}

export default function App() {
  const [codigoInput, setCodigoInput] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);

  async function buscar(event) {
    event.preventDefault();
    setError(null);
    setResultado(null);
    try {
      setCargando(true);
      const codigo = normalizarCodigo(codigoInput);
      const datos = await consultarLote(codigo);
      if (!datos.lote) {
        setError(`El lote ${codigoInput} no está registrado en la cadena.`);
        return;
      }
      setResultado(datos);
    } catch (err) {
      const mensaje = err?.reason ?? err?.message ?? String(err);
      setError(/network|connection|fetch|timeout|json-rpc|not found|ECONN/i.test(mensaje)
        ? 'No se pudo conectar a la red. Revisa tu conexión y vuelve a intentarlo.'
        : mensaje);
    } finally {
      setCargando(false);
    }
  }

    const eventosOrdenados = resultado?.eventos
    ? resultado.eventos.map((ev, i) => ({ ev, i })).reverse().slice(0, 10)
    : [];

  return (
    <div className="contenedor">
      <header className="encabezado">
        <h1>Trazabilidad de Medicamentos</h1>
        <p className="subtitulo">
          Cadena de custodia e integridad registrada en HashKey Chain Testnet.
        </p>
      </header>

      <form className="buscador" onSubmit={buscar}>
        <label htmlFor="codigo">Código del lote (UID del tag RFID)</label>
        <div className="fila-buscador">
          <input
            id="codigo"
            type="text"
            value={codigoInput}
            onChange={(e) => setCodigoInput(e.target.value)}
            placeholder="LOTE-VACUNA-001"
            autoComplete="off"
            spellCheck="false"
          />
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

          <div className="timeline">
            {eventosOrdenados.map(({ ev, i }, pos) => {
              const cond = parsearCondicion(ev.condicion);
              const esUltimo = pos === 0;
              return (
                <div key={i} className={`evento ${cond.esAlerta ? 'evento-alerta' : 'evento-ok'} ${esUltimo ? 'evento-ultimo' : ''}`}>
                  <div className="evento-linea">
                    <div className="evento-punto"></div>
                  </div>
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
                          <div className="sensor">
                            <span className="sensor-icono">🌡️</span>
                            <span className="sensor-valor">{cond.temp}°C</span>
                            <span className="sensor-label">Temperatura</span>
                          </div>
                          <div className="sensor">
                            <span className="sensor-icono">📊</span>
                            <span className="sensor-valor">{cond.acel}</span>
                            <span className="sensor-label">Aceleración</span>
                          </div>
                          <div className="sensor">
                            <span className="sensor-icono">🚶</span>
                            <span className="sensor-valor">{cond.mov === '0' ? 'No' : 'Sí'}</span>
                            <span className="sensor-label">Movimiento</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className={`evento-simple ${cond.esAlerta ? 'tag-rojo' : 'tag-verde'}`}>
                        {cond.etiqueta}
                      </div>
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