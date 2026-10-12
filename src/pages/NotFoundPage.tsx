import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="page">
      <h1>Страница не найдена</h1>
      <p className="muted">Запрошенный адрес отсутствует в приложении.</p>
      <Link to="/" className="btn btn--primary">
        В реестр
      </Link>
    </div>
  )
}
