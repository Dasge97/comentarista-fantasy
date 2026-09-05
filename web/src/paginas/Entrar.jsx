import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Aviso } from '../componentes/comunes.jsx';

/**
 * Pantalla de entrada.
 *
 * El administrador entra con contraseña. Un participante entra con el
 * enlace que le da el bot de Telegram, que trae el código en la dirección.
 */
export default function Entrar({ alEntrar }) {
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [canjeando, setCanjeando] = useState(false);

  // Si la dirección trae un código, se canjea solo.
  useEffect(() => {
    const codigo = new URLSearchParams(window.location.search).get('codigo');
    if (!codigo) return;
    setCanjeando(true);
    api
      .entrarConCodigo(codigo)
      .then((r) => {
        window.history.replaceState({}, '', window.location.pathname);
        alEntrar({ identificado: true, ...r.usuario });
      })
      .catch((e) => setError(e.message))
      .finally(() => setCanjeando(false));
  }, [alEntrar]);

  async function enviar(evento) {
    evento.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await api.entrar(contrasena);
      alEntrar({ identificado: true, ...r.usuario });
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="entrada">
      <div className="tarjeta">
        <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>Comentarista Fantasy</h1>
        <p className="suave" style={{ marginTop: 0 }}>
          {canjeando ? 'Comprobando tu enlace…' : 'Entra para ver la liga.'}
        </p>

        <Aviso>{error}</Aviso>

        <form onSubmit={enviar}>
          <label>
            <span>Contraseña de administrador</span>
            <input
              type="password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button className="accion" type="submit" disabled={enviando || !contrasena}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="suave" style={{ fontSize: 13, marginBottom: 0 }}>
          Si eres uno de los managers de la liga, pide tu enlace al bot de Telegram con el comando /web.
        </p>
      </div>
    </div>
  );
}
