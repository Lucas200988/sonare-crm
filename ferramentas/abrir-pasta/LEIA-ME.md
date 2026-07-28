# Abrir a pasta do projeto em um clique

No cartão do projeto existe o botão **Abrir pasta**. Para ele funcionar, cada
computador precisa receber um atalho — uma vez só.

## Instalação (1 minuto, sem senha de administrador)

1. Copie esta pasta (`abrir-pasta`) para o computador — pode ser pela rede
2. Dê **duplo clique** em `instalar.cmd`
3. Aguarde a mensagem "Pronto!" e feche a janela

Na primeira vez que clicar em **Abrir pasta**, o navegador pergunta se pode
abrir o aplicativo. Marque **"Sempre permitir"** e clique em **Abrir** — a
pergunta não volta a aparecer.

## Como funciona

O botão do sistema chama um endereço no formato `sonare://abrir?p=<caminho>`.
O Windows repassa para o script `abrir-pasta.vbs`, que confere o caminho e
abre o Explorador nele.

O script **só abre o Explorador**. Ele recusa qualquer texto que não seja um
caminho de pasta (`Z:\...` ou `\\servidor\...`) e bloqueia caracteres usados
para encadear comandos. Se a pasta não existir — unidade de rede desconectada,
por exemplo — aparece um aviso explicando.

Tudo é gravado apenas no perfil do usuário
(`HKCU\Software\Classes\sonare` e `%LOCALAPPDATA%\SonareCRM`), sem alterar
configurações da máquina.

## Se não instalar

O botão continua útil: ao perceber que o atalho não existe, o sistema copia o
caminho automaticamente e avisa. Aí é só abrir o Explorador (Win+E), clicar na
barra de endereço (Ctrl+L) e colar (Ctrl+V).

## Desinstalar

Abra o Prompt de Comando e rode:

```
reg delete "HKCU\Software\Classes\sonare" /f
```

Depois apague a pasta `%LOCALAPPDATA%\SonareCRM`.
