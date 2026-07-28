// Documento PDF da proposta comercial no padrão SONARE
// (estrutura espelhada dos modelos oficiais em "Modelo Orçamento" do drive Z:).
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatBRL } from '@/lib/money';
import { formatDateBR, formatDateTimeBR } from '@/lib/dates';
import { parseInline, classifyLine } from '@/lib/rich-text';
import { htmlToBlocks, type InlineRun } from '@/lib/html-blocks';
import { isHtml } from '@/lib/html-text';

const BRAND = '#e22020';
const INK = '#111111';
const MUTED = '#555555';

const styles = StyleSheet.create({
  page: { paddingTop: 96, paddingBottom: 72, paddingHorizontal: 48, fontSize: 9.5, color: INK, fontFamily: 'Helvetica', lineHeight: 1.45 },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: 48, paddingTop: 24, paddingBottom: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: BRAND,
  },
  logo: { height: 36, width: 158, objectFit: 'contain' },
  headerRight: { textAlign: 'right', color: MUTED, fontSize: 8 },
  // A4 tem 842pt de altura; `bottom` não é respeitado em elementos fixed nesta
  // versão do react-pdf, então o rodapé é ancorado por `top`.
  footer: {
    position: 'absolute', top: 776, left: 48, right: 48,
    paddingTop: 7,
    borderTopWidth: 1, borderTopColor: '#dddddd',
    flexDirection: 'row', justifyContent: 'space-between',
    color: MUTED, fontSize: 7.5, lineHeight: 1.25,
  },
  // Bloco de identificação (como no modelo: ORÇAMENTO + nº + cliente + responsável)
  // Fundos claros: economizam tinta na impressão sem perder hierarquia
  titleBar: {
    backgroundColor: '#eeeeee', color: INK, paddingVertical: 7, paddingHorizontal: 10,
    borderLeftWidth: 3, borderLeftColor: BRAND,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  titleBarText: { fontFamily: 'Helvetica-Bold', fontSize: 13, letterSpacing: 2 },
  idGrid: { flexDirection: 'row', borderWidth: 0.8, borderColor: '#cccccc', borderTopWidth: 0, marginBottom: 14 },
  idCell: { flex: 1, padding: 7 },
  idCellBorder: { borderLeftWidth: 0.8, borderLeftColor: '#cccccc' },
  idLabel: { fontSize: 7, color: MUTED, textTransform: 'uppercase', marginBottom: 1.5 },
  idValue: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  intro: { marginBottom: 10, textAlign: 'justify' },
  sectionTitle: {
    fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: BRAND,
    marginTop: 13, marginBottom: 4,
  },
  paragraph: { textAlign: 'justify' },
  bullet: { flexDirection: 'row', marginBottom: 1.5 },
  bulletDash: { width: 10 },
  subHeading: { fontFamily: 'Helvetica-Bold', marginTop: 5, marginBottom: 2, textTransform: 'uppercase', fontSize: 9 },
  // subtítulo que separa os serviços dentro de uma mesma seção
  subServiceHeading: {
    fontFamily: 'Helvetica-Bold', fontSize: 9, color: INK,
    marginTop: 6, marginBottom: 2.5,
    borderBottomWidth: 0.5, borderBottomColor: '#dddddd', paddingBottom: 1.5,
  },
  table: { marginTop: 4 },
  thead: {
    flexDirection: 'row', backgroundColor: '#eeeeee',
    borderBottomWidth: 1, borderBottomColor: '#bbbbbb',
    paddingVertical: 5, paddingHorizontal: 4,
  },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: INK },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e5e5e5', paddingVertical: 4, paddingHorizontal: 4 },
  cDesc: { flex: 5, paddingRight: 6 },
  cQty: { flex: 1.1, textAlign: 'right' },
  cUnit: { flex: 1, textAlign: 'center' },
  cPrice: { flex: 1.8, textAlign: 'right' },
  cTotal: { flex: 1.9, textAlign: 'right' },
  totalBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#f4f4f4', borderTopWidth: 1.5, borderTopColor: BRAND,
    paddingVertical: 6, paddingHorizontal: 8, marginTop: 2,
  },
  totalLabel: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  totalValue: { fontFamily: 'Helvetica-Bold', fontSize: 12 },
  adjustRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 2, paddingHorizontal: 8 },
  signature: { marginTop: 34, alignItems: 'center' },
  // Largura suficiente para títulos longos ("Eng. Esp. Civil e Eletricista")
  // caberem em uma linha só, sem hifenização feia.
  signLine: { width: 340, borderTopWidth: 0.8, borderTopColor: INK, paddingTop: 5, alignItems: 'center' },
  signName: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  signRole: { fontSize: 8.5, color: INK, marginTop: 2, textAlign: 'center' },
  signContact: { fontSize: 8, color: MUTED, marginTop: 1, textAlign: 'center' },
  // Selo de assinatura eletrônica
  stamp: {
    marginTop: 16, flexDirection: 'row', gap: 10, alignItems: 'center',
    borderWidth: 0.8, borderColor: '#cccccc', borderRadius: 3, padding: 8,
  },
  stampQr: { width: 56, height: 56 },
  stampTitle: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: INK, marginBottom: 2 },
  stampText: { fontSize: 7, color: MUTED, lineHeight: 1.4 },
  stampCode: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: BRAND, letterSpacing: 1 },
  watermark: {
    position: 'absolute', top: 360, left: 0, right: 0,
    textAlign: 'center', fontSize: 52, fontFamily: 'Helvetica-Bold',
    color: '#e22020', opacity: 0.12, transform: 'rotate(-30deg)', letterSpacing: 3,
  },
});

export type ProposalPdfData = {
  logoPng?: Buffer | null;
  proposalCode: string;
  company: {
    legalName: string;
    cnpj?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    crea?: string | null;
  };
  client: { legalName: string; document?: string | null; email?: string | null };
  responsibleContact?: string | null; // responsável no cliente
  clientUnit?: string | null;
  budgetCode: string;
  versionNumber: number;
  issuedAt: Date;
  validUntil?: Date | null;
  serviceType?: string | null;
  scope?: string | null;
  premises?: string | null;
  exclusions?: string | null;
  executionDeadline?: string | null;
  deliveryMethod?: string | null;
  paymentTerms?: string | null;
  clientNotes?: string | null;
  generalInfo?: string | null; // 6 - INFORMAÇÕES GERAIS (texto padrão configurável)
  differentials?: string | null; // 7 - DIFERENCIAIS (texto padrão configurável)
  items: Array<{
    description: string;
    unit?: string | null;
    quantity: string;
    unitPrice: string;
    total: string;
  }>;
  subtotal: string;
  discount: string;
  surcharge: string;
  total: string;
  signerName?: string | null;
  signerTitle?: string | null;
  signerRegistration?: string | null; // CREA/CAU
  signerPhone?: string | null;
  signerEmail?: string | null;
  /** Assinatura eletrônica: selo de conferência impresso ao pé do documento. */
  signature?: {
    verificationCode: string;
    verificationUrl: string;
    qrPng: Buffer | null;
    signedAt: Date;
  } | null;
  /** Marca d'água diagonal — usada na pré-visualização. */
  watermark?: string | null;
};

/** Aplica os marcadores de negrito e itálico dentro de uma linha. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((seg, i) => (
        <Text
          key={i}
          style={{
            fontFamily: seg.bold ? 'Helvetica-Bold' : undefined,
            fontStyle: seg.italic ? 'italic' : undefined,
          }}
        >
          {seg.text}
        </Text>
      ))}
    </>
  );
}

/**
 * Renderiza um texto multilinha: "-" vira marcador, "1." vira lista numerada,
 * linhas em maiúsculas viram subtítulos (separando os serviços de um orçamento
 * com vários escopos) e os marcadores de negrito e itálico valem dentro da linha.
 */
/** Trechos com negrito/itálico/sublinhado vindos do editor rico. */
function Runs({ runs }: { runs: InlineRun[] }) {
  return (
    <>
      {runs.map((r, i) => (
        <Text
          key={i}
          style={{
            fontFamily: r.bold ? 'Helvetica-Bold' : undefined,
            fontStyle: r.italic ? 'italic' : undefined,
            textDecoration: r.underline ? 'underline' : undefined,
          }}
        >
          {r.text}
        </Text>
      ))}
    </>
  );
}

/** Renderiza o HTML do editor preservando alinhamento, listas e títulos. */
function HtmlBlock({ html }: { html: string }) {
  return (
    <View>
      {htmlToBlocks(html).map((b, i) => {
        if (b.kind === 'listItem') {
          return (
            <View key={i} style={styles.bullet}>
              <Text style={styles.bulletDash}>{b.marker}</Text>
              <Text style={[styles.paragraph, { flex: 1, textAlign: b.align }]}>
                <Runs runs={b.runs} />
              </Text>
            </View>
          );
        }
        if (b.kind === 'heading') {
          return (
            <Text key={i} style={[styles.subServiceHeading, { textAlign: b.align }]} minPresenceAhead={30}>
              <Runs runs={b.runs} />
            </Text>
          );
        }
        return (
          <Text key={i} style={[styles.paragraph, { marginBottom: 2, textAlign: b.align }]}>
            <Runs runs={b.runs} />
          </Text>
        );
      })}
    </View>
  );
}

function TextBlock({ text }: { text?: string | null }) {
  if (!text) return null;
  // Conteúdo do editor rico; os orçamentos antigos seguem pelo caminho de texto puro
  if (isHtml(text)) return <HtmlBlock html={text} />;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <View>
      {lines.map((line, i) => {
        const { kind, content, marker } = classifyLine(line);

        if (kind === 'bullet' || kind === 'numbered') {
          return (
            <View key={i} style={styles.bullet}>
              <Text style={styles.bulletDash}>{marker ?? '-'}</Text>
              <Text style={[styles.paragraph, { flex: 1 }]}><Inline text={content} /></Text>
            </View>
          );
        }
        if (kind === 'heading') {
          return (
            <Text key={i} style={styles.subServiceHeading} minPresenceAhead={30}>
              <Inline text={content} />
            </Text>
          );
        }
        return (
          <Text key={i} style={[styles.paragraph, { marginBottom: 2 }]}><Inline text={content} /></Text>
        );
      })}
    </View>
  );
}

/**
 * Seção numerada.
 *
 * `keepTogether` mantém a seção inteira na mesma página — a quebra cai entre
 * tópicos, não no meio de um. Usado nas seções de tamanho previsível.
 * As seções longas (descrição dos serviços, informações gerais) fluem entre
 * páginas com o título protegido por `minPresenceAhead`, pois podem passar de
 * uma página inteira e travá-las cortaria o conteúdo.
 */
function Section({
  number, title, children, keepTogether = true,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
  keepTogether?: boolean;
}) {
  return (
    <View wrap={!keepTogether} minPresenceAhead={keepTogether ? undefined : 0}>
      <Text style={styles.sectionTitle} minPresenceAhead={44}>{number} - {title}</Text>
      {children}
    </View>
  );
}

export function ProposalPdf({ data }: { data: ProposalPdfData }) {
  const version = `V${String(data.versionNumber).padStart(2, '0')}`;
  const numero = `${data.budgetCode} ${version}`;

  return (
    <Document title={`${data.proposalCode} — ${data.client.legalName}`} author={data.company.legalName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          {data.logoPng ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={{ data: data.logoPng, format: 'png' }} style={styles.logo} />
          ) : (
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 14 }}>
              SONARE <Text style={{ color: BRAND }}>Engenharia</Text>
            </Text>
          )}
          <View style={styles.headerRight}>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: INK, fontSize: 9 }}>{data.proposalCode}</Text>
            <Text>Ref. {numero}</Text>
            <Text>{formatDateBR(data.issuedAt)}</Text>
          </View>
        </View>

        {data.watermark ? (
          <Text style={styles.watermark} fixed>{data.watermark}</Text>
        ) : null}

        <View style={styles.footer} fixed>
          <View>
            <Text>
              {data.company.legalName}
              {data.company.cnpj ? ` · CNPJ ${data.company.cnpj}` : ''}
              {data.company.crea ? ` · CREA ${data.company.crea}` : ''}
            </Text>
            <Text>
              {[
                data.company.address,
                data.company.city && `${data.company.city}/${data.company.state ?? ''}`,
              ].filter(Boolean).join(' — ')}
            </Text>
            <Text>
              {[data.company.phone, data.company.email, data.company.website].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>

        {/* Barra ORÇAMENTO + identificação, como no modelo oficial */}
        <View style={styles.titleBar}>
          <Text style={styles.titleBarText}>ORÇAMENTO</Text>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10 }}>{numero}</Text>
        </View>
        <View style={styles.idGrid}>
          <View style={styles.idCell}>
            <Text style={styles.idLabel}>Cliente</Text>
            <Text style={styles.idValue}>{data.client.legalName}</Text>
            {data.client.document ? <Text style={{ fontSize: 8, color: MUTED }}>{data.client.document}</Text> : null}
          </View>
          <View style={[styles.idCell, styles.idCellBorder]}>
            <Text style={styles.idLabel}>Responsável</Text>
            <Text style={styles.idValue}>{data.responsibleContact ?? '—'}</Text>
            {data.clientUnit ? <Text style={{ fontSize: 8, color: MUTED }}>{data.clientUnit}</Text> : null}
          </View>
        </View>

        <Text style={styles.intro}>
          Conforme solicitado, apresentamos a proposta comercial para {data.serviceType ? data.serviceType.toLowerCase() : 'a prestação de serviços de engenharia'}.
        </Text>

        <Section number={1} title="DESCRIÇÃO DOS SERVIÇOS" keepTogether={false}>
          <TextBlock text={data.scope} />
          {data.premises ? (
            <View>
              <Text style={styles.subHeading}>Premissas</Text>
              <TextBlock text={data.premises} />
            </View>
          ) : null}
          {data.exclusions ? (
            <View>
              <Text style={styles.subHeading}>Não fazem parte desta proposta</Text>
              <TextBlock text={data.exclusions} />
            </View>
          ) : null}
        </Section>

        <Section number={2} title="VALOR DA PROPOSTA">
          <View style={styles.table}>
            <View style={styles.thead}>
              <Text style={[styles.th, styles.cDesc]}>Descrição</Text>
              <Text style={[styles.th, styles.cQty]}>Qtd.</Text>
              <Text style={[styles.th, styles.cUnit]}>Un.</Text>
              <Text style={[styles.th, styles.cPrice]}>Valor unit.</Text>
              <Text style={[styles.th, styles.cTotal]}>Total</Text>
            </View>
            {data.items.map((item, i) => (
              <View key={i} style={styles.tr} wrap={false}>
                <Text style={styles.cDesc}>{item.description}</Text>
                <Text style={styles.cQty}>{Number(item.quantity).toLocaleString('pt-BR')}</Text>
                <Text style={styles.cUnit}>{item.unit ?? '—'}</Text>
                <Text style={styles.cPrice}>{formatBRL(item.unitPrice)}</Text>
                <Text style={styles.cTotal}>{formatBRL(item.total)}</Text>
              </View>
            ))}
            {Number(data.discount) > 0 ? (
              <View style={styles.adjustRow}>
                <Text style={{ color: MUTED }}>Desconto: - {formatBRL(data.discount)}</Text>
              </View>
            ) : null}
            {Number(data.surcharge) > 0 ? (
              <View style={styles.adjustRow}>
                <Text style={{ color: MUTED }}>Acréscimo: {formatBRL(data.surcharge)}</Text>
              </View>
            ) : null}
            <View style={styles.totalBar} wrap={false}>
              <Text style={styles.totalLabel}>VALOR TOTAL DA PROPOSTA</Text>
              <Text style={styles.totalValue}>{formatBRL(data.total)}</Text>
            </View>
          </View>
        </Section>

        <Section number={3} title="FORMA DE PAGAMENTO">
          <TextBlock text={data.paymentTerms ?? 'A combinar.'} />
        </Section>

        <Section number={4} title="PREVISÃO DE ENTREGA (PRAZO)">
          <TextBlock text={data.executionDeadline ?? 'A combinar.'} />
          {data.deliveryMethod ? <TextBlock text={`- Forma de entrega: ${data.deliveryMethod}`} /> : null}
        </Section>

        <Section number={5} title="VALIDADE DA PROPOSTA">
          <Text style={styles.paragraph}>
            {data.validUntil ? `- Válida até ${formatDateBR(data.validUntil)}.` : '- 15 dias.'}
          </Text>
        </Section>

        {data.generalInfo || data.clientNotes ? (
          <Section number={6} title="INFORMAÇÕES GERAIS" keepTogether={false}>
            <TextBlock text={data.generalInfo} />
            <TextBlock text={data.clientNotes} />
          </Section>
        ) : null}

        {data.differentials ? (
          <Section number={7} title="DIFERENCIAIS">
            <TextBlock text={data.differentials} />
          </Section>
        ) : null}

        <View style={styles.signature} wrap={false}>
          <View style={styles.signLine}>
            <Text style={styles.signName}>{data.signerName ?? data.company.legalName}</Text>
            {data.signerTitle ? <Text style={styles.signRole}>{data.signerTitle}</Text> : null}
            {data.signerRegistration ? <Text style={styles.signRole}>{data.signerRegistration}</Text> : null}
            {data.signerPhone ? <Text style={styles.signContact}>Tel. {data.signerPhone}</Text> : null}
            {data.signerEmail ? <Text style={styles.signContact}>{data.signerEmail}</Text> : null}
          </View>
        </View>

        {data.signature ? (
          <View style={styles.stamp} wrap={false}>
            {data.signature.qrPng ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={{ data: data.signature.qrPng, format: 'png' }} style={styles.stampQr} />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.stampTitle}>DOCUMENTO ASSINADO ELETRONICAMENTE</Text>
              <Text style={styles.stampText}>
                Assinado por {data.signerName ?? data.company.legalName}
                {data.signerRegistration ? ` (${data.signerRegistration})` : ''} em{' '}
                {formatDateTimeBR(data.signature.signedAt)}.
              </Text>
              <Text style={styles.stampText}>
                Confira a autenticidade em {data.signature.verificationUrl} usando o código:
              </Text>
              <Text style={styles.stampCode}>{data.signature.verificationCode}</Text>
              <Text style={[styles.stampText, { fontSize: 6, marginTop: 2 }]}>
                Assinatura eletrônica nos termos do art. 10, §2º, da MP 2.200-2/2001.
              </Text>
            </View>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
