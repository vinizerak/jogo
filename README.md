# Território — app de conquista por localização

Protótipo funcional: mapa real (OpenStreetMap), conquista de área por
GPS, recorte geométrico real entre territórios (Turf.js), estado de
disputa por 24h ao morder território de outro jogador, e backend real
no Firebase para sincronizar entre jogadores.

## Passo 1 — Criar o projeto Firebase (gratuito)

1. Acesse https://console.firebase.google.com e crie um projeto novo.
2. Em **Build > Authentication**, ative o método "Anônimo".
3. Em **Build > Firestore Database**, crie o banco (modo produção).
4. Em **Configurações do projeto > Seus apps**, adicione um app Web
   e copie as chaves geradas.
5. Cole essas chaves no arquivo `src/firebase-config.js`, substituindo
   os campos `COLOQUE_AQUI`.

## Passo 2 — Publicar as regras e as Cloud Functions

Isso exige o Firebase CLI, que roda no seu computador (não precisa de
Android Studio, é bem mais leve). Instale o Node.js se ainda não
tiver, depois:

```
npm install -g firebase-tools
firebase login
cd territorio-app
firebase use --add        (selecione o projeto que você criou)
firebase deploy --only firestore:rules,functions
```

Isso publica as regras de segurança e as três funções do backend
(`conquerTerritory`, `reinforceDispute`, `resolveExpiredDisputes`).

**Atenção**: Cloud Functions no plano gratuito exigem que o projeto
Firebase esteja no plano "Blaze" (pré-pago), mas o Google mantém uma
cota mensal gratuita generosa em cima disso — dificilmente vocês
passam do gratuito com um grupo de amigos. Não é cobrado nada sem
você ultrapassar a cota, mas é necessário cadastrar um cartão para
ativar o plano Blaze.

## Passo 3 — Gerar o APK (sem instalar Android Studio)

1. Suba todos os arquivos desta pasta para um repositório no GitHub.
2. Vá até a aba **Actions** do repositório.
3. O workflow "Build APK" roda sozinho. Se não rodar automaticamente,
   clique nele e depois em "Run workflow".
4. Baixe o `.apk` gerado em "Artifacts" ao final da build.
5. Transfira para o celular Android e instale (permitindo "fontes
   desconhecidas" quando solicitado).

## O que já funciona

- Mapa real com ruas e nomes (OpenStreetMap via Leaflet)
- GPS real do celular (Capacitor)
- Câmera nativa acionada ao confirmar conquista
- Login anônimo automático (sem tela de cadastro)
- Territórios salvos de verdade no Firestore, compartilhados entre
  todos os jogadores
- Checagem local antes de qualquer chamada ao servidor
- Conquista processada em Cloud Function no servidor (o app nunca
  escreve direto no banco, evitando trapaça de localização)
- Recorte geométrico real (Turf.js) rodando no servidor
- Território mordido vira "disputado" por 24h
- Resolução automática de disputas expiradas (função agendada,
  roda de hora em hora, sem custo de ficar checando o tempo todo)

## O que ainda falta

- Reinforce de disputa (`reinforceDispute`) ainda não está ligado a
  nenhum botão na interface — falta o app detectar quando você está
  em cima de uma área disputada e oferecer "defender"
- Push notification quando alguém invade seu território
- Tela de perfil / ranking entre amigos
- HQ / proteção de endereço residencial (adiado, ver conversa)

