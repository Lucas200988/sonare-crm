' Abre no Explorador a pasta indicada pelo link sonare:// do CRM.
'
' O navegador chama:  sonare://abrir?p=Z%3A%5CSONARE%5CProjetos
' (o Windows pode entregar como "sonare://abrir/?p=..." — a barra extra e as
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

' Pega tudo depois de "p=" — funciona com ou sem a barra que o navegador
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

Function DecodeUrl(texto)
  Dim i, c, resultado
  resultado = ""
  i = 1
  Do While i <= Len(texto)
    c = Mid(texto, i, 1)
    If c = "%" And i + 2 <= Len(texto) Then
      resultado = resultado & Chr(CLng("&H" & Mid(texto, i + 1, 2)))
      i = i + 3
    ElseIf c = "+" Then
      resultado = resultado & " "
      i = i + 1
    Else
      resultado = resultado & c
      i = i + 1
    End If
  Loop
  DecodeUrl = resultado
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
