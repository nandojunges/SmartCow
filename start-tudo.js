import { spawn, execSync } from 'child_process';
import ngrok from 'ngrok';
import fs from 'fs';
import path from 'path';
import net from 'net';
import 'dotenv/config';
import dbModule from './backend/db.js';

const { initDB } = dbModule;

// Correção automática para conta admin
try {
  const db = initDB('nandokkk@hotmail.com');
  db.prepare("UPDATE usuarios SET verificado = 1 WHERE email = 'nandokkk@hotmail.com'").run();
  console.log('✅ Conta admin verificada automaticamente.');
} catch (err) {
  console.error('⚠️ Erro ao verificar admin:', err.message);
}

// 🧹 Limpa a pasta dist com comando do Windows
const distPath = path.join('.', 'dist');
if (fs.existsSync(distPath)) {
  console.log('🧹 Limpando pasta dist...');
  try {
    execSync('rd /s /q dist');
  } catch {
    console.log('⚠️ Erro ao limpar dist (talvez já estava vazia ou em uso).');
  }
}

// 🔪 Mata processos da porta 3001
try {
  const result = execSync('netstat -ano | findstr :3001').toString();
  const lines = result.trim().split('\n');
  const pids = new Set();

  lines.forEach((line) => {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid !== '0') pids.add(pid);
  });

  pids.forEach((pid) => {
    try {
      execSync(`taskkill /PID ${pid} /F`);
      console.log(`✔️ Processo na porta 3001 (PID ${pid}) finalizado.`);
    } catch (e) {
      console.log(`⚠️ Não foi possível finalizar PID ${pid}:`, e.message);
    }
  });
} catch (err) {
  console.log('ℹ️ Nenhum processo ocupando a porta 3001.');
}

// 🎯 Build do frontend
console.log('\n🎯 Rodando build...');
const build = spawn('npm', ['run', 'build'], { stdio: 'inherit', shell: true });

build.on('exit', (code) => {
  if (code !== 0) {
    console.error('❌ Erro no build.');
    process.exit(1);
  }

  // 🚀 Sobe o backend
  console.log('\n🚀 Iniciando backend...');
  spawn('nodemon', ['backend/server.js'], { stdio: 'inherit', shell: true });

  // ⏳ Aguarda a porta  abrir
  const esperaBackend = setInterval(() => {
    const client = net.createConnection({ port: 3001 }, async () => {
      clearInterval(esperaBackend);
      client.end();

      // 🌐 Inicia o ngrok
      try {
        const url = await ngrok.connect(3001);
        console.log('\n=============================');
        console.log(`✅ NGROK rodando em: ${url}`);
        console.log('🌐 Acesse também via: http://localhost:3001');
        console.log('=============================\n');
      } catch (error) {
        console.error('❌ Erro ao iniciar ngrok direto:', error.message || error);
      }
    });

    client.on('error', () => {
      // Porta ainda não disponível, continua tentando...
    });
  }, 1500);
});
