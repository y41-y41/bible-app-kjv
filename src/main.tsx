import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Remove the CSS import since index.css is loaded via HTML
// import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);