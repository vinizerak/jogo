# Território — app de conquista por localização

Protótipo funcional: mapa real (OpenStreetMap), conquista de área por
GPS, recorte geométrico real entre territórios (Turf.js), e estado de
disputa por 24h ao morder território de outro jogador.

## Como gerar o APK (sem instalar Android Studio)

1. Crie uma conta gratuita em https://github.com se ainda não tiver.
2. Crie um repositório novo (pode ser privado) e suba todos os
   arquivos desta pasta para ele.
3. Vá até a aba **Actions** do repositório no GitHub.
4. O workflow "Build APK" deve rodar sozinho assim que você subir o
   código. Se não rodar automaticamente, clique nele e depois em
   "Run workflow".
5. Espere a build terminar (leva alguns minutos).
6. Clique na build concluída, desça até "Artifacts" e baixe
   `territorio-app-apk`.
7. Descompacte o `.zip` baixado — dentro dele está o `app-debug.apk`.
8. Transfira esse `.apk` para o celular Android (por cabo, Google
   Drive, WhatsApp Web, etc.) e abra o arquivo para instalar.
   O Android vai pedir para permitir "instalar de fontes
   desconhecidas" na primeira vez — é esperado, já que o app não
   está vindo da Play Store.

## O que já funciona neste protótipo

- Mapa real com ruas e nomes (OpenStreetMap via Leaflet)
- Pega a localização real do celular (GPS nativo via Capacitor)
- Botão "conquistar" sempre visível; só gasta processamento quando
  clicado
- Checagem 100% local antes de qualquer chamada de servidor: se a
  área já é sua, avisa na hora sem gastar nada
- Recorte geométrico real (Turf.js) entre o círculo conquistado e
  territórios já existentes — não é sobreposição visual, é dono real
  por pedaço
- Território mordido de outro jogador vira "disputado" (visual
  laranja tracejado)
- Câmera nativa é acionada ao confirmar conquista

## O que ainda falta (próximos passos)

- Backend real (Firebase ou Supabase) para persistir os territórios
  entre sessões e sincronizar entre jogadores
- Autenticação de usuário
- Lógica do timer de disputa de 24h rodando no servidor
- Push notification quando alguém invade seu território
- Tela de perfil / ranking entre amigos
