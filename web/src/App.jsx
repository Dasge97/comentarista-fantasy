import { useEffect, useState } from 'react';
import { api } from './api.js';
import Entrar from './paginas/Entrar.jsx';
import { Clasificacion, Dinero, Manager, Mercado, Movimientos, Precios } from './paginas/liga.jsx';
import { BaseDeDatos, Ajustes, Estado, Notificar, UsuariosAdmin } from './paginas/admin.jsx';

const PAGINAS = [
  { id: 'clasificacion', titulo: 'Clasificación', grupo: 'La liga', componente: Clasificacion },
  { id: 'managers', titulo: 'Managers', grupo: 'La liga', componente: Manager },
  { id: 'dinero', titulo: 'Dinero', grupo: 'La liga', componente: Dinero },
  { id: 'mercado', titulo: 'Mercado', grupo: 'La liga', componente: Mercado },
  { id: 'movimientos', titulo: 'Movimientos', grupo: 'La liga', componente: Movimientos },
  { id: 'precios', titulo: 'Precios', grupo: 'La liga', componente: Precios },
  { id: 'estado', titulo: 'Estado', grupo: 'Administración', componente: Estado, soloAdmin: true },
  { id: 'ajustes', titulo: 'Configuración', grupo: 'Administración', componente: Ajustes, soloAdmin: true },
  { id: 'usuarios', titulo: 'Usuarios', grupo: 'Administración', componente: UsuariosAdmin, soloAdmin: true },
  { id: 'notificar', titulo: 'Notificaciones', grupo: 'Administración', componente: Notificar, soloAdmin: true },
  { id: 'bd', titulo: 'Base de datos', grupo: 'Administración', componente: BaseDeDatos, soloAdmin: true },
];

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [comprobando, setComprobando] = useState(true);
  const [pagina, setPagina] = useState(() => window.location.hash.slice(1) || 'clasificacion');

  useEffect(() => {
    api
      .yo()
      .then((r) => setUsuario(r.identificado ? r : null))
      .catch(() => setUsuario(null))
      .finally(() => setComprobando(false));
  }, []);

  useEffect(() => {
    const alCambiar = () => setPagina(window.location.hash.slice(1) || 'clasificacion');
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

  if (comprobando) return <div className="entrada"><p className="suave">Un momento…</p></div>;
  if (!usuario) return <Entrar alEntrar={setUsuario} />;

  const visibles = PAGINAS.filter((p) => !p.soloAdmin || usuario.rol === 'administrador');
  const actual = visibles.find((p) => p.id === pagina) || visibles[0];
  const Componente = actual.componente;

  const grupos = [...new Set(visibles.map((p) => p.grupo))];

  return (
    <div className="marco">
      <nav className="lateral">
        <div className="marca">
          Comentarista Fantasy
          <small>
            {usuario.nombre} · {usuario.rol}
          </small>
        </div>
        {grupos.map((grupo) => (
          <div key={grupo}>
            <h4>{grupo}</h4>
            {visibles
              .filter((p) => p.grupo === grupo)
              .map((p) => (
                <button
                  key={p.id}
                  aria-current={p.id === actual.id}
                  onClick={() => {
                    window.location.hash = p.id;
                  }}
                >
                  {p.titulo}
                </button>
              ))}
          </div>
        ))}
        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          <button
            onClick={async () => {
              await api.salir();
              setUsuario(null);
            }}
          >
            Salir
          </button>
        </div>
      </nav>
      <main className="contenido">
        <Componente usuario={usuario} />
      </main>
    </div>
  );
}
