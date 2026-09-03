import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

/**
 * O documento RDO — Relatório Diário de Obra.
 *
 * Formato consagrado nos canteiros: cabeçalho tabular com os prazos, clima,
 * mão de obra somada, atividades com andamento, ocorrências, fotos legendadas
 * e as três linhas de assinatura. O fiscal compara este PDF com o de qualquer
 * outra obra e se sente em casa — não é hora de inventar diagramação.
 */

const BRAND = '#C62828';
const INK = '#1a1a1a';
const LINE = '#9a9a9a';
const HEAD_BG = '#efefef';

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 46, paddingHorizontal: 30, fontSize: 8.5, fontFamily: 'Helvetica', color: INK },
  bold: { fontFamily: 'Helvetica-Bold' },

  // tabela de cabeçalho
  grid: { borderWidth: 0.8, borderColor: LINE },
  row: { flexDirection: 'row', borderTopWidth: 0.8, borderColor: LINE },
  rowFirst: { flexDirection: 'row' },
  cellLabel: { backgroundColor: HEAD_BG, fontFamily: 'Helvetica-Bold', padding: 3.5 },
  cell: { padding: 3.5 },
  vline: { borderLeftWidth: 0.8, borderColor: LINE },

  logo: { height: 30, width: 120, objectFit: 'contain' },
  titulo: { fontFamily: 'Helvetica-Bold', fontSize: 11, textAlign: 'center', paddingVertical: 5 },

  // seções
  secao: { marginTop: 8, borderWidth: 0.8, borderColor: LINE },
  secaoTitulo: {
    backgroundColor: HEAD_BG, borderBottomWidth: 0.8, borderColor: LINE,
    padding: 4, fontFamily: 'Helvetica-Bold', color: BRAND, fontSize: 9,
  },
  item: { padding: 4, borderTopWidth: 0.4, borderColor: '#cccccc' },
  itemPrimeiro: { padding: 4 },

  fotoBloco: { width: '33.33%', padding: 3 },
  fotoImg: { width: '100%', height: 110, objectFit: 'cover', borderWidth: 0.6, borderColor: LINE },
  fotoLegenda: { fontSize: 7, marginTop: 2, color: '#333333' },

  assinaturas: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 26 },
  assinatura: { width: '31%', alignItems: 'center' },
  assinaturaLinha: { borderTopWidth: 0.8, borderColor: INK, width: '100%', paddingTop: 3, alignItems: 'center' },

  rodape: {
    position: 'absolute', bottom: 14, left: 30, right: 30,
    borderTopWidth: 0.5, borderColor: LINE, paddingTop: 4,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 6.8, color: '#555555',
  },
  chipStatus: {
    alignSelf: 'flex-start', backgroundColor: '#f5a623', color: '#ffffff',
    paddingHorizontal: 5, paddingVertical: 2, fontSize: 7.5, fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  chipAprovado: { backgroundColor: '#2e7d32' },
});

export type RdoPdfData = {
  logoPng: Buffer | null;
  codigo: string;
  numero: number;
  dataBR: string;
  diaSemana: string;
  status: 'Preenchendo Relatório' | 'Finalizado' | 'Aprovado';
  obra: {
    nome: string;
    endereco: string | null;
    contratante: string;
    responsavel: string | null;
    contrato: string | null;
    periodo: string | null; // "17/08/2026 até 17/01/2028"
  };
  prazos: { contratual: number | null; decorrido: number | null; aVencer: number | null };
  clima: Array<{ periodo: string; rotulo: string; condicao: string | null }>;
  climaObs: string | null;
  maoDeObra: Array<{ funcao: string; quantidade: number; origem: 'PROPRIA' | 'TERCEIRO' }>;
  totaisEquipe: { propria: number; terceiros: number; total: number };
  equipamentos: Array<{ nome: string; quantidade: number; identificacao: string | null }>;
  atividades: Array<{ titulo: string; descricao: string | null; percentual: number | null; andamento: string | null }>;
  ocorrencias: Array<{ titulo: string; descricao: string | null; responsavel: string | null; status: string | null }>;
  comentarios: Array<{ titulo: string; descricao: string | null }>;
  narrativa: string | null;
  fotos: Array<{ imagem: Buffer; formato: 'jpg' | 'png'; legenda: string | null }>;
  videos: Array<{ nome: string; descricao: string | null }>;
  anexos: Array<{ nome: string; descricao: string | null }>;
  assinaturas: Array<{ rotulo: string; nome: string | null; registro: string | null; assinadoEmBR: string | null }>;
  rodape: { criadoPor: string | null; criadoEmBR: string; modificadoEmBR: string | null };
  verificacao: { codigo: string; url: string; hashInicio: string | null; qrPng: Buffer | null } | null;
};

const dias = (n: number | null) => (n === null ? '—' : `${n} dia${n === 1 ? '' : 's'}`);

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={s.secao}>
      <Text style={s.secaoTitulo}>{titulo}</Text>
      {children}
    </View>
  );
}

/** Uma página (um dia) — compartilhada entre o PDF avulso e o do período. */
export function RdoPagina({ data }: { data: RdoPdfData }) {
  const d = data;
  return (
      <Page size="A4" style={s.page}>
        <Text style={[s.chipStatus, ...(d.status === 'Aprovado' ? [s.chipAprovado] : [])]}>
          {d.status}
        </Text>

        {/* Cabeçalho tabular */}
        <View style={s.grid}>
          <View style={s.rowFirst}>
            <View style={[s.cell, { width: '55%', alignItems: 'center', justifyContent: 'center' }]}>
              {d.logoPng ? <Image src={{ data: d.logoPng, format: 'png' }} style={s.logo} /> : null}
            </View>
            <View style={[s.vline, { width: '45%' }]}>
              <View style={s.rowFirst}>
                <Text style={[s.cellLabel, { width: '45%' }]}>Relatório nº</Text>
                <Text style={[s.cell, s.vline, { width: '55%' }]}>{d.numero}</Text>
              </View>
              <View style={s.row}>
                <Text style={[s.cellLabel, { width: '45%' }]}>Data</Text>
                <Text style={[s.cell, s.vline, { width: '55%' }]}>{d.dataBR}</Text>
              </View>
              <View style={s.row}>
                <Text style={[s.cellLabel, { width: '45%' }]}>Dia da semana</Text>
                <Text style={[s.cell, s.vline, { width: '55%' }]}>{d.diaSemana}</Text>
              </View>
              <View style={s.row}>
                <Text style={[s.cellLabel, { width: '45%' }]}>Nº do contrato</Text>
                <Text style={[s.cell, s.vline, { width: '55%' }]}>{d.obra.contrato ?? '—'}</Text>
              </View>
            </View>
          </View>

          <View style={s.row}><Text style={[s.titulo, { width: '100%' }]}>Relatório Diário de Obra (RDO)</Text></View>

          <View style={s.row}>
            <Text style={[s.cellLabel, { width: '12%' }]}>Obra</Text>
            <Text style={[s.cell, s.vline, { width: '58%' }]}>
              {d.obra.nome}{d.obra.periodo ? `\n${d.obra.periodo}` : ''}
            </Text>
            <Text style={[s.cellLabel, s.vline, { width: '16%' }]}>Prazo contratual</Text>
            <Text style={[s.cell, s.vline, { width: '14%' }]}>{dias(d.prazos.contratual)}</Text>
          </View>
          <View style={s.row}>
            <Text style={[s.cellLabel, { width: '12%' }]}>Endereço</Text>
            <Text style={[s.cell, s.vline, { width: '58%' }]}>{d.obra.endereco ?? '—'}</Text>
            <Text style={[s.cellLabel, s.vline, { width: '16%' }]}>Prazo decorrido</Text>
            <Text style={[s.cell, s.vline, { width: '14%' }]}>{dias(d.prazos.decorrido)}</Text>
          </View>
          <View style={s.row}>
            <Text style={[s.cellLabel, { width: '12%' }]}>Contratante</Text>
            <Text style={[s.cell, s.vline, { width: '30%' }]}>{d.obra.contratante}</Text>
            <Text style={[s.cellLabel, s.vline, { width: '13%' }]}>Responsável</Text>
            <Text style={[s.cell, s.vline, { width: '15%' }]}>{d.obra.responsavel ?? '—'}</Text>
            <Text style={[s.cellLabel, s.vline, { width: '16%' }]}>Prazo a vencer</Text>
            <Text style={[s.cell, s.vline, { width: '14%' }]}>{dias(d.prazos.aVencer)}</Text>
          </View>
        </View>

        {/* Clima */}
        {d.clima.length > 0 ? (
          <View style={[s.secao, { marginTop: 8 }]}>
            <View style={s.rowFirst}>
              <Text style={[s.cellLabel, { width: '25%' }]}>Clima</Text>
              <Text style={[s.cellLabel, s.vline, { width: '45%' }]}>Tempo</Text>
              <Text style={[s.cellLabel, s.vline, { width: '30%' }]}>Condição</Text>
            </View>
            {d.clima.map((c, i) => (
              <View key={i} style={s.row}>
                <Text style={[s.cell, { width: '25%' }]}>{c.periodo}</Text>
                <Text style={[s.cell, s.vline, { width: '45%' }]}>{c.rotulo}</Text>
                <Text style={[s.cell, s.vline, { width: '30%' }]}>{c.condicao ?? '—'}</Text>
              </View>
            ))}
            {d.climaObs ? (
              <View style={s.row}><Text style={[s.cell, { width: '100%', fontSize: 7.5 }]}>{d.climaObs}</Text></View>
            ) : null}
          </View>
        ) : null}

        {/* Mão de obra */}
        {d.maoDeObra.length > 0 ? (
          <Secao titulo={`Mão de obra (${d.totaisEquipe.total})`}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {d.maoDeObra.map((m, i) => (
                <View key={i} style={[s.fotoBloco, { width: '25%' }]}>
                  <Text style={{ textAlign: 'center', fontFamily: 'Helvetica-Bold' }}>{m.funcao}</Text>
                  <Text style={{ textAlign: 'center' }}>{m.quantidade}</Text>
                </View>
              ))}
            </View>
            <View style={[s.row, { backgroundColor: HEAD_BG }]}>
              <Text style={[s.cell, { width: '50%', textAlign: 'center' }]}>
                Mão de obra própria: {d.totaisEquipe.propria}
              </Text>
              <Text style={[s.cell, s.vline, { width: '50%', textAlign: 'center' }]}>
                Terceiros: {d.totaisEquipe.terceiros}
              </Text>
            </View>
          </Secao>
        ) : null}

        {/* Equipamentos */}
        {d.equipamentos.length > 0 ? (
          <Secao titulo={`Equipamentos (${d.equipamentos.reduce((a, e) => a + e.quantidade, 0)})`}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {d.equipamentos.map((e, i) => (
                <View key={i} style={[s.fotoBloco, { width: '25%' }]}>
                  <Text style={{ textAlign: 'center', fontFamily: 'Helvetica-Bold' }}>
                    {e.nome}{e.identificacao ? ` (${e.identificacao})` : ''}
                  </Text>
                  <Text style={{ textAlign: 'center' }}>{e.quantidade}</Text>
                </View>
              ))}
            </View>
          </Secao>
        ) : null}

        {/* Atividades */}
        <Secao titulo={`Atividades (${d.atividades.length})`}>
          {d.atividades.length === 0 ? (
            <Text style={s.itemPrimeiro}>Nenhuma atividade registrada.</Text>
          ) : d.atividades.map((a, i) => (
            <View key={i} style={[i === 0 ? s.itemPrimeiro : s.item, { flexDirection: 'row', justifyContent: 'space-between' }]}>
              <View style={{ width: '78%' }}>
                <Text>{a.titulo}</Text>
                {a.descricao ? <Text style={{ fontSize: 7.5, color: '#444444' }}>{a.descricao}</Text> : null}
              </View>
              <Text style={{ width: '20%', textAlign: 'right', color: '#555555' }}>
                {a.percentual !== null ? `${a.percentual}%` : ''}{a.andamento ? ` ${a.andamento}` : ''}
              </Text>
            </View>
          ))}
        </Secao>

        {/* Ocorrências */}
        <Secao titulo={`Ocorrências (${d.ocorrencias.length})`}>
          {d.ocorrencias.length === 0 ? (
            <Text style={s.itemPrimeiro}>Sem ocorrências.</Text>
          ) : d.ocorrencias.map((o, i) => (
            <View key={i} style={i === 0 ? s.itemPrimeiro : s.item}>
              <Text style={s.bold}>{o.titulo}{o.status ? `  ·  ${o.status}` : ''}</Text>
              {o.descricao ? <Text style={{ fontSize: 7.5 }}>{o.descricao}</Text> : null}
              {o.responsavel ? <Text style={{ fontSize: 7.5, color: '#555555' }}>Responsável: {o.responsavel}</Text> : null}
            </View>
          ))}
        </Secao>

        {/* Comentários */}
        <Secao titulo={`Comentários (${d.comentarios.length})`}>
          {d.comentarios.length === 0 ? (
            <Text style={s.itemPrimeiro}>Sem comentários.</Text>
          ) : d.comentarios.map((c, i) => (
            <View key={i} style={i === 0 ? s.itemPrimeiro : s.item}>
              <Text>{c.titulo}</Text>
              {c.descricao ? <Text style={{ fontSize: 7.5 }}>{c.descricao}</Text> : null}
            </View>
          ))}
        </Secao>

        {/* Narrativa */}
        {d.narrativa ? (
          <Secao titulo="Relato do dia">
            <Text style={s.itemPrimeiro}>{d.narrativa}</Text>
          </Secao>
        ) : null}

        {/* Fotos */}
        {d.fotos.length > 0 ? (
          <Secao titulo={`Fotos (${d.fotos.length})`}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 2 }}>
              {d.fotos.map((f, i) => (
                <View key={i} style={s.fotoBloco} wrap={false}>
                  <Image src={{ data: f.imagem, format: f.formato }} style={s.fotoImg} />
                  {f.legenda ? <Text style={s.fotoLegenda}>{f.legenda}</Text> : null}
                </View>
              ))}
            </View>
          </Secao>
        ) : null}

        {/* Vídeos e anexos: o PDF não os carrega, mas registra que existem */}
        {d.videos.length > 0 ? (
          <Secao titulo={`Vídeos (${d.videos.length})`}>
            {d.videos.map((v, i) => (
              <Text key={i} style={i === 0 ? s.itemPrimeiro : s.item}>
                {v.nome}{v.descricao ? ` — ${v.descricao}` : ''}
              </Text>
            ))}
          </Secao>
        ) : null}
        {d.anexos.length > 0 ? (
          <Secao titulo={`Anexos (${d.anexos.length})`}>
            {d.anexos.map((a, i) => (
              <Text key={i} style={i === 0 ? s.itemPrimeiro : s.item}>
                {a.nome}{a.descricao ? ` — ${a.descricao}` : ''}
              </Text>
            ))}
          </Secao>
        ) : null}

        {/* Assinaturas */}
        <View style={s.assinaturas} wrap={false}>
          {d.assinaturas.map((a, i) => (
            <View key={i} style={s.assinatura}>
              {a.nome ? (
                <View style={{ alignItems: 'center', marginBottom: 3 }}>
                  <Text style={s.bold}>{a.nome}</Text>
                  {a.registro ? <Text style={{ fontSize: 7 }}>{a.registro}</Text> : null}
                  {a.assinadoEmBR ? (
                    <Text style={{ fontSize: 6.8, color: '#555555' }}>
                      Assinado eletronicamente em {a.assinadoEmBR}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Text style={{ marginBottom: 14 }}> </Text>
              )}
              <View style={s.assinaturaLinha}>
                <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold' }}>{a.rotulo}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Selo de verificação */}
        {d.verificacao ? (
          <View style={[s.secao, { marginTop: 10, flexDirection: 'row', alignItems: 'center', padding: 6 }]} wrap={false}>
            {d.verificacao.qrPng ? (
              <Image src={{ data: d.verificacao.qrPng, format: 'png' }} style={{ width: 52, height: 52, marginRight: 8 }} />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={s.bold}>Conferência de autenticidade</Text>
              <Text style={{ fontSize: 7.5 }}>
                Código {d.verificacao.codigo} — confira em {d.verificacao.url}
              </Text>
              {d.verificacao.hashInicio ? (
                <Text style={{ fontSize: 6.8, color: '#555555' }}>SHA-256: {d.verificacao.hashInicio}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Rodapé fixo */}
        <View style={s.rodape} fixed>
          <Text>
            {d.rodape.criadoPor ? `Criado por: ${d.rodape.criadoPor} (${d.rodape.criadoEmBR})` : `Criado em ${d.rodape.criadoEmBR}`}
            {d.rodape.modificadoEmBR ? `  ·  Última modificação: ${d.rodape.modificadoEmBR}` : ''}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${d.codigo}  ·  ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
  );
}

export function RdoPdf({ data }: { data: RdoPdfData }) {
  return (
    <Document title={`${data.codigo} — RDO nº ${data.numero}`} author="SONARE CRM">
      <RdoPagina data={data} />
    </Document>
  );
}

/** Todos os RDOs de um período num único arquivo — o pacote da medição. */
export function RdoLotePdf({ dados, titulo }: { dados: RdoPdfData[]; titulo: string }) {
  return (
    <Document title={titulo} author="SONARE CRM">
      {dados.map((d) => <RdoPagina key={d.codigo} data={d} />)}
    </Document>
  );
}
