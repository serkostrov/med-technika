import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  onReset?: () => void
}

type State = {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Необработанная ошибка UI', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="state-panel state-panel--error" role="alert">
          <h1>Произошла ошибка</h1>
          <p>{this.state.error.message || 'Неизвестная ошибка приложения'}</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              this.setState({ error: null })
              this.props.onReset?.()
            }}
          >
            Попробовать снова
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
