import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createStandaloneHost } from './host/standaloneHost';
import './styles/widget.css';
import './styles/standalone.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

createRoot(container).render(
  <StrictMode>
    <App host={createStandaloneHost()} />
  </StrictMode>,
);
