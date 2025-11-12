import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initializeConfigFromFile } from './services/configLoader';
import './styles.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

initializeConfigFromFile()
  .catch((error) => {
    console.warn('初始化外部配置失败，使用本地默认配置。', error);
  })
  .finally(() => {
    createRoot(container).render(
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>
    );
  });


