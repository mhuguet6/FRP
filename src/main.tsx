import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import './index.css'
import { Landing } from './routes/public/Landing'
import { MensajeEnviado } from './routes/public/MensajeEnviado'
import { Callback } from './routes/public/Callback'
import { MisExpedientes } from './routes/public/MisExpedientes'
import { FormularioExpediente } from './features/expediente/FormularioExpediente'
import { BackofficeList } from './routes/backoffice/BackofficeList'
import { BackofficeDetalle } from './routes/backoffice/BackofficeDetalle'
import { BackofficeInvitaciones } from './routes/backoffice/BackofficeInvitaciones'
import { RequireAuth } from './components/RequireAuth'

const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/mensaje-enviado', element: <MensajeEnviado /> },
  { path: '/callback', element: <Callback /> },
  {
    path: '/mis-expedientes',
    element: (
      <RequireAuth>
        <MisExpedientes />
      </RequireAuth>
    ),
  },
  {
    path: '/expediente/:id',
    element: (
      <RequireAuth>
        <FormularioExpediente />
      </RequireAuth>
    ),
  },
  {
    path: '/admin',
    element: (
      <RequireAuth>
        <BackofficeList />
      </RequireAuth>
    ),
  },
  {
    path: '/admin/expediente/:id',
    element: (
      <RequireAuth>
        <BackofficeDetalle />
      </RequireAuth>
    ),
  },
  {
    path: '/admin/invitaciones',
    element: (
      <RequireAuth>
        <BackofficeInvitaciones />
      </RequireAuth>
    ),
  },
  { path: '*', element: <Navigate to="/" replace /> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
