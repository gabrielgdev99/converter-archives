# Vireun Converter

Conversor local da agência Vireun para Windows 10 e 11. O arquivo fica no seu computador: não há upload, conta nem servidor.

Você solta um arquivo numa zona flutuante, ou escolhe **Converter com Vireun** no Explorer. Abre um menu circular com as conversões daquele tipo. A saída é gravada ao lado do original, com um sufixo, sem substituir o que já existe.

## Instalar

1. Baixe `Vireun-Converter-Setup-1.0.0.exe`.
2. Execute o instalador. Ele não pede administrador e grava em `%LOCALAPPDATA%\Vireun Converter`.
3. Se o SmartScreen avisar que o publicador é desconhecido, clique em **Mais informações** e depois em **Executar assim mesmo**. O instalador não tem assinatura digital.
4. Ao terminar, o app pode abrir direto. Ele fica na bandeja, perto do relógio, e não mostra uma janela permanente.

Para remover, use **Desinstalar** no menu Iniciar, ou o `Desinstalar.exe` da pasta de instalação. Isso também tira o item do Explorer e o início automático.

## Usar

- **Bandeja:** clique no ícone para abrir a zona de soltar. O botão direito abre Configurações e Sair.
- **Atalho:** `Ctrl+Alt+V` abre a zona. Solte um ou mais arquivos do mesmo tipo. O menu radial aparece ao lado do cursor.
- **Explorer:** clique com o botão direito no arquivo e escolha **Converter com Vireun**. Vários arquivos selecionados chegam juntos no mesmo menu.
- Escolha um formato ou uma ferramenta. Recortar, aparar e comprimir pedem um ajuste antes de começar.
- Vídeos e áudios longos mostram uma barra de progresso. No fim, um aviso do Windows e a janela **Concluído**, com **Mostrar na pasta**.

O nome novo fica na mesma pasta. Exemplos: `foto-vireun.jpg`, `foto-comprimido.webp`, `clipe-aparado.mp4`, `doc-pagina-1.png`, `relatorio-junto.pdf`. Se o nome já existe, entra um número: `foto-vireun-2.jpg`.

Em Configurações dá para mudar o atalho, ligar o início com o Windows, esconder o item do Explorer e desligar o aviso ao terminar.

## O que converte

| Origem | Saídas e ferramentas |
| --- | --- |
| Imagem (png, jpg, webp, avif, heic, gif, ico, svg) | PNG, JPG, WebP, AVIF, GIF, ICO, PDF, recortar, comprimir |
| Vídeo (mp4, mov, webm, mkv) | MP4, MOV, WebM, MKV, GIF, extrair áudio, aparar, comprimir, juntar |
| Áudio (mp3, wav, aac, ogg, flac) | MP3, WAV, AAC, OGG, FLAC, aparar, comprimir, juntar |
| PDF | PNG por página, juntar, comprimir |
| Documento (docx, xlsx, pptx) | PDF, se o LibreOffice estiver instalado |

SVG vira imagem pelo resvg, incluso no app. HEIC é lido por um decodificador local, sem enviar o arquivo. GIF de vídeo usa os primeiros 15 segundos e largura de 480 pixels.

BMP e TIFF também entram como imagem, porque o FFmpeg já os lê.

## LibreOffice

DOCX, XLSX e PPTX só viram PDF se o [LibreOffice](https://pt-br.libreoffice.org) estiver instalado. O app procura `soffice.exe` em `C:\Program Files\LibreOffice` e no PATH. Se não achar, o item PDF do menu fica apagado e o texto explica o que falta. O Vireun Converter não traz o LibreOffice, porque o pacote é grande.

## Por que não há Shift e arrastar

Segurar Shift e arrastar um arquivo do Explorer parece simples, mas no Windows é instável. Um hook global de mouse não recebe a lista de arquivos do arraste OLE do Explorer. Uma janela transparente em tela cheia, para servir de alvo, briga com outros programas e quebra o arraste. Antivírus e as atualizações do Windows também derrubam esse tipo de hook.

Por isso o acionamento é outro, e o menu radial é o mesmo nos dois caminhos:

1. Zona de soltar, aberta pelo atalho global ou pela bandeja.
2. Item **Converter com Vireun** no menu de contexto do Explorer, gravado em `HKCU` (sem administrador).

## Limitações

- Tudo roda offline. É preciso ter o FFmpeg incluso, que já vem no instalador.
- Comprimir PDF transforma cada página em imagem. O arquivo costuma ficar menor, mas o texto deixa de ser selecionável.
- Comprimir PNG, GIF, SVG ou ICO gera WebP. WAV e FLAC comprimidos saem em OGG, porque esses formatos já são sem perda.
- AVIF pode demorar. O FFmpeg do instalador usa libaom. Se o FFmpeg do sistema tiver SVT-AV1, fotos de 64 px ou mais usam esse codificador.
- Juntar vídeos ou áudios regrava os arquivos, para não falhar quando os codecs diferem.
- PDF com mais de 150 páginas é recusado de uma vez, para não encher o disco.
- HEIC incomum ou corrompido mostra um erro. Não há envio para um serviço externo.
- O instalador não é assinado. O SmartScreen pode pedir confirmação.
- Iniciar com o Windows e o menu do Explorer valem na cópia instalada, não ao rodar o código solto em outra plataforma.

## Privacidade

Nenhuma conversão abre rede. O processo só lê o arquivo que você escolheu e grava o resultado na mesma pasta. Um log curto em `%APPDATA%\Vireun Converter\vireun.log` guarda erros, não o conteúdo dos arquivos.

## Desenvolvimento

Requisitos: Node.js 22, FFmpeg no PATH para os testes, e `makensis` para gerar o instalador.

```bash
npm install
npm test
npm start
npm run dist:win
```

`npm test` cobre as conversões principais neste ambiente: imagem (incluindo SVG, ICO, AVIF e HEIC), vídeo, áudio, PDF, recorte, aparo, junção, compressão e a mensagem quando o LibreOffice não está instalado.

O instalador para Windows já está em `instalador/Vireun-Converter-Setup-1.0.0.exe` (cerca de 90 MB).

`npm run dist:win` baixa o Electron de Windows e, se faltar, compila um FFmpeg GPL enxuto para Windows (`scripts/build-ffmpeg-win.sh`, precisa de mingw-w64, nasm, cmake e pkg-config). Ele gera de novo o mesmo arquivo em `release/`. Esse FFmpeg traz H.264, VP9, WebP, MP3, Vorbis, Opus, AAC, FLAC e AV1. HEIC usa o decodificador incluso no app. SVG vira PNG pelo resvg.

O arquivo `tests/fixtures/amostra.heic` só serve para o teste do decodificador. Ele não entra no instalador.

## Licenças

Veja `THIRD_PARTY.txt`. O binário do FFmpeg é GPL. O restante do app é de uso interno da Vireun.
