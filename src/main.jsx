// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
// se você tiver um index.css, mantenha; se não, pode remover a linha abaixo
import "./index.css";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// (opcional) se você tiver o provider de configuração, pode envolver o App.
// Comente as 2 linhas abaixo se não estiver usando.
// import { ConfiguracaoProvider } from "./context/ConfiguracaoContext.jsx";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* <ConfiguracaoProvider> */}
        <App />
      {/* </ConfiguracaoProvider> */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
);
