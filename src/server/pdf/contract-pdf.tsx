// Minuta de contrato em PDF, no padrão dos modelos oficiais da SONARE.
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatDateLongBR, formatDateTimeBR } from '@/lib/dates';
import type { RenderedClause } from '@/lib/contract-render';

const BRAND = '#e22020';
const INK = '#111111';
const MUTED = '#555555';

const styles = StyleSheet.create({
  page: {
    paddingTop: 92, paddingBottom: 78, paddingHorizontal: 52,
    fontSize: 9.5, color: INK, fontFamily: 'Helvetica', lineHeight: 1.5,
  },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingHorizontal: 52, paddingTop: 24, paddingBottom: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: BRAND,
  },
  logo: { height: 34, width: 150, objectFit: 'contain' },
  headerRight: { textAlign: 'right', color: MUTED, fontSize: 8 },
  footer: {
    position: 'absolute', top: 776, left: 52, right: 52,
    paddingTop: 7, borderTopWidth: 1, borderTopColor: '#dddddd',
    flexDirection: 'row', justifyContent: 'space-between',
    color: MUTED, fontSize: 7.5, lineHeight: 1.25,
  },
  docTitle: {
    fontSize: 12, fontFamily: 'Helvetica-Bold', textAlign: 'center',
    marginBottom: 14, textTransform: 'uppercase',
  },
  partiesHeading: {
    fontSize: 10, fontFamily: 'Helvetica-Bold', color: BRAND, marginBottom: 5,
  },
  party: { textAlign: 'justify', marginBottom: 7 },
  preamble: { textAlign: 'justify', marginTop: 4, marginBottom: 10, fontFamily: 'Helvetica-Oblique' },
  clauseHeading: {
    fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: BRAND,
    marginTop: 11, marginBottom: 3,
  },
  paragraph: { flexDirection: 'row', marginBottom: 3 },
  paragraphNumber: { width: 26, fontFamily: 'Helvetica-Bold', fontSize: 9 },
  paragraphText: { flex: 1, textAlign: 'justify' },
  item: { flexDirection: 'row', marginBottom: 2, paddingLeft: 26 },
  itemNumber: { width: 22, fontFamily: 'Helvetica-Bold', fontSize: 9 },
  closing: { marginTop: 14, textAlign: 'justify' },
  place: { marginTop: 18, textAlign: 'right' },
  signBlock: { marginTop: 30, flexDirection: 'row', justifyContent: 'space-between' },
  signBox: { width: '45%', alignItems: 'center' },
  signLine: { width: '100%', borderTopWidth: 0.8, borderTopColor: INK, paddingTop: 4, alignItems: 'center' },
  signName: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, textAlign: 'center' },
  signInfo: { fontSize: 7.5, color: MUTED, textAlign: 'center' },
  witnesses: { marginTop: 26 },
  witnessRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 },
  stamp: {
    marginTop: 20, flexDirection: 'row', gap: 10, alignItems: 'center',
    borderWidth: 0.8, borderColor: '#cccccc', borderRadius: 3, padding: 8,
  },
  stampQr: { width: 54, height: 54 },
  stampTitle: { fontFamily: 'Helvetica-Bold', fontSize: 8, marginBottom: 2 },
  stampText: { fontSize: 7, color: MUTED, lineHeight: 1.4 },
  stampCode: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: BRAND, letterSpacing: 1 },
});

export type ContractPdfData = {
  logoPng?: Buffer | null;
  documentTitle: string;
  contractCode: string;
  versionNumber: number;
  issuedAt: Date;
  contractingParty: string;
  contractedParty: string;
  preamble: string;
  clauses: RenderedClause[];
  place: string;
  signers: {
    contractingName: string;
    contractingDocument?: string | null;
    contractedName: string;
    contractedDocument?: string | null;
  };
  witnesses?: Array<{ name?: string | null; cpf?: string | null }>;
  company: {
    legalName: string;
    cnpj?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    crea?: string | null;
  };
  signature?: {
    verificationCode: string;
    verificationUrl: string;
    qrPng: Buffer | null;
    signedAt: Date;
    signerName?: string | null;
  } | null;
};

export function ContractPdf({ data }: { data: ContractPdfData }) {
  const version = `V${String(data.versionNumber).padStart(2, '0')}`;

  return (
    <Document title={`${data.contractCode} — ${data.documentTitle}`} author={data.company.legalName}>
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
            <Text style={{ fontFamily: 'Helvetica-Bold', color: INK, fontSize: 9 }}>{data.contractCode}</Text>
            <Text>Minuta {version}</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <View>
            <Text>
              {data.company.legalName}
              {data.company.cnpj ? ` · CNPJ ${data.company.cnpj}` : ''}
              {data.company.crea ? ` · CREA ${data.company.crea}` : ''}
            </Text>
            <Text>
              {[data.company.address, data.company.city && `${data.company.city}/${data.company.state ?? ''}`]
                .filter(Boolean).join(' — ')}
            </Text>
            <Text>{[data.company.phone, data.company.email, data.company.website].filter(Boolean).join(' · ')}</Text>
          </View>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>

        <Text style={styles.docTitle}>{data.documentTitle}</Text>

        <Text style={styles.partiesHeading}>DAS PARTES</Text>
        <Text style={styles.party}>{data.contractingParty}</Text>
        <Text style={styles.party}>{data.contractedParty}</Text>
        <Text style={styles.preamble}>{data.preamble}</Text>

        {data.clauses.map((clause, i) => (
          <View key={i} minPresenceAhead={50}>
            <Text style={styles.clauseHeading}>{clause.heading}</Text>
            {clause.paragraphs.map((p) => (
              <View key={p.number} style={styles.paragraph}>
                <Text style={styles.paragraphNumber}>{p.number}</Text>
                <Text style={styles.paragraphText}>{p.text}</Text>
              </View>
            ))}
            {clause.items.map((item) => (
              <View key={item.number} style={styles.item}>
                <Text style={styles.itemNumber}>{item.number} –</Text>
                <Text style={styles.paragraphText}>{item.text}</Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.closing}>
          Nestes termos, as partes firmam o presente instrumento em duas vias de igual teor e forma,
          obrigando-se por si e seus sucessores ao fiel cumprimento das cláusulas e condições aqui estipuladas.
        </Text>

        <Text style={styles.place}>{data.place}, {formatDateLongBR(data.issuedAt)}.</Text>

        <View style={styles.signBlock} wrap={false}>
          <View style={styles.signBox}>
            <View style={styles.signLine}>
              <Text style={styles.signName}>{data.signers.contractingName.toUpperCase()}</Text>
              {data.signers.contractingDocument ? (
                <Text style={styles.signInfo}>{data.signers.contractingDocument}</Text>
              ) : null}
              <Text style={styles.signInfo}>CONTRATANTE</Text>
            </View>
          </View>
          <View style={styles.signBox}>
            <View style={styles.signLine}>
              <Text style={styles.signName}>{data.signers.contractedName.toUpperCase()}</Text>
              {data.signers.contractedDocument ? (
                <Text style={styles.signInfo}>{data.signers.contractedDocument}</Text>
              ) : null}
              <Text style={styles.signInfo}>CONTRATADA</Text>
            </View>
          </View>
        </View>

        <View style={styles.witnesses} wrap={false}>
          <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold' }}>TESTEMUNHAS</Text>
          <View style={styles.witnessRow}>
            {[0, 1].map((i) => {
              const w = data.witnesses?.[i];
              return (
                <View key={i} style={styles.signBox}>
                  <View style={styles.signLine}>
                    <Text style={styles.signName}>{w?.name ? w.name.toUpperCase() : `TESTEMUNHA ${i + 1}`}</Text>
                    <Text style={styles.signInfo}>CPF: {w?.cpf ?? '________________'}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {data.signature ? (
          <View style={styles.stamp} wrap={false}>
            {data.signature.qrPng ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={{ data: data.signature.qrPng, format: 'png' }} style={styles.stampQr} />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.stampTitle}>MINUTA EMITIDA ELETRONICAMENTE</Text>
              <Text style={styles.stampText}>
                Emitida por {data.signature.signerName ?? data.company.legalName} em{' '}
                {formatDateTimeBR(data.signature.signedAt)}.
              </Text>
              <Text style={styles.stampText}>
                Confira a autenticidade em {data.signature.verificationUrl} usando o código:
              </Text>
              <Text style={styles.stampCode}>{data.signature.verificationCode}</Text>
              <Text style={[styles.stampText, { fontSize: 6, marginTop: 2 }]}>
                A validade jurídica depende da assinatura das partes e das testemunhas.
              </Text>
            </View>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
