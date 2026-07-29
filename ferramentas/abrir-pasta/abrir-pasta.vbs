' Abre no Explorador a pasta indicada pelo link sonare:// do CRM.
'
' O navegador chama:  sonare://abrir?p=Z%3A%5CSONARE%5CProjetos
' (o Windows pode entregar como "sonare://abrir/?p=..." -- a barra extra e as
' variacoes de formato sao tratadas abaixo).
'
' Este script abre APENAS o Explorador no caminho recebido. Nada mais e
' executado: o caminho e validado antes de ser usado.
'
' Sem acentos de proposito: o VBScript le o arquivo como ANSI e caracteres
' acentuados apareceriam corrompidos nas mensagens.

Option Explicit

Dim args, bruto, caminho, pos
Set args = WScript.Arguments
If args.Count = 0 Then WScript.Quit 1

bruto = args(0)

' Pega tudo depois de "p=" -- funciona com ou sem a barra que o navegador
' acrescenta, e independe do prefixo exato do protocolo.
pos = InStr(1, bruto, "p=", vbTextCompare)
If pos > 0 Then
  bruto = Mid(bruto, pos + 2)
Else
  ' Formato inesperado: descarta o prefixo do protocolo, se houver
  pos = InStr(bruto, "?")
  If pos > 0 Then bruto = Mid(bruto, pos + 1)
End If

' Barra final que alguns navegadores acrescentam
Do While Right(bruto, 1) = "/"
  bruto = Left(bruto, Len(bruto) - 1)
Loop

caminho = DecodeUrl(bruto)
' Barras normais viram invertidas (caso o caminho venha no formato de URL)
caminho = Replace(caminho, "/", "\")

If Not CaminhoValido(caminho) Then
  MsgBox "Caminho de pasta invalido:" & vbCrLf & vbCrLf & caminho, 48, "SONARE CRM"
  WScript.Quit 1
End If

Dim fso
Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FolderExists(caminho) Then
  MsgBox "A pasta nao foi encontrada:" & vbCrLf & vbCrLf & caminho & vbCrLf & vbCrLf & _
         "Verifique se a unidade de rede esta conectada.", 48, "SONARE CRM"
  WScript.Quit 1
End If

Dim shell
Set shell = CreateObject("WScript.Shell")
shell.Run "explorer.exe """ & caminho & """", 1, False

' ---------------------------------------------------------------

' Os %XX do navegador sao bytes UTF-8: um acento ocupa dois bytes
' (a: %C3%A1). Decodificar byte a byte com Chr() corrompia acentos
' ("Cuiaba" virava "CuiabA?" e a pasta nao era encontrada). Aqui os
' bytes sao juntados e convertidos como UTF-8 de verdade.
Function DecodeUrl(texto)
  Dim i, c, bytes(), total
  ReDim bytes(Len(texto))
  total = 0
  i = 1
  Do While i <= Len(texto)
    c = Mid(texto, i, 1)
    If c = "%" And i + 2 <= Len(texto) Then
      bytes(total) = CLng("&H" & Mid(texto, i + 1, 2))
      i = i + 3
    ElseIf c = "+" Then
      bytes(total) = 32
      i = i + 1
    Else
      bytes(total) = AscW(c)
      i = i + 1
    End If
    total = total + 1
  Loop
  DecodeUrl = Utf8ParaTexto(bytes, total)
End Function

' Converte a sequencia de bytes UTF-8 em texto (1 a 4 bytes por caractere).
' Byte invalido e mantido como esta, para a mensagem de erro mostrar algo.
Function Utf8ParaTexto(bytes, total)
  Dim i, b, ponto, resultado
  resultado = ""
  i = 0
  Do While i < total
    b = bytes(i)
    If b < 128 Then
      ponto = b
      i = i + 1
    ElseIf b >= 194 And b <= 223 And i + 1 < total Then
      ponto = (b - 192) * 64 + (bytes(i + 1) And 63)
      i = i + 2
    ElseIf b >= 224 And b <= 239 And i + 2 < total Then
      ponto = (b - 224) * 4096 + (bytes(i + 1) And 63) * 64 + (bytes(i + 2) And 63)
      i = i + 3
    ElseIf b >= 240 And i + 3 < total Then
      ponto = (b - 240) * 262144 + (bytes(i + 1) And 63) * 4096 + _
              (bytes(i + 2) And 63) * 64 + (bytes(i + 3) And 63)
      i = i + 4
    Else
      ponto = b
      i = i + 1
    End If

    If ponto > 65535 Then
      ' fora do plano basico: vira par substituto (emoji em nome de pasta)
      ponto = ponto - 65536
      resultado = resultado & ChrW(55296 + Int(ponto / 1024)) & ChrW(56320 + (ponto Mod 1024))
    Else
      resultado = resultado & ChrW(ponto)
    End If
  Loop
  Utf8ParaTexto = resultado
End Function

' Aceita apenas caminho local (C:\...) ou de rede (\\servidor\...).
' Bloqueia aspas e sinais que poderiam encadear outro comando.
Function CaminhoValido(p)
  Dim re
  CaminhoValido = False
  If Len(p) < 3 Then Exit Function
  If InStr(p, """") > 0 Or InStr(p, "&") > 0 Or InStr(p, "|") > 0 Then Exit Function
  If InStr(p, "<") > 0 Or InStr(p, ">") > 0 Or InStr(p, "^") > 0 Then Exit Function

  Set re = New RegExp
  re.Pattern = "^([A-Za-z]:\\|\\\\[^\\]+\\)"
  CaminhoValido = re.Test(p)
End Function
