import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

// Endereço da API que você confirmou que abre no navegador.
// Se o IP/porta do backend mudar, altere esta constante.
const API_BASE_URL = 'http://10.137.11.6';

async function lerResposta(response) {
  let dados;

  try {
    dados = await response.json();
  } catch {
    throw new Error(`A API retornou uma resposta inválida (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(
      dados?.error || dados?.message || `Erro HTTP ${response.status}.`
    );
  }

  return dados;
}

async function requisitar(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      'Não foi possível conectar à API. Confira a rede, o endereço do servidor e se o backend está ativo.'
    );
  }

  return lerResposta(response);
}

async function listarSensoresApi() {
  const resultado = await requisitar('/api/sensor/status/listar');

  if (!Array.isArray(resultado?.data)) {
    throw new Error('A resposta da listagem não contém uma lista válida no campo "data".');
  }

  return resultado.data;
}

async function consultarSensorApi(codigo) {
  return requisitar(
    `/api/sensor/status/visualizar/${encodeURIComponent(codigo)}`
  );
}

async function atualizarSensorApi(codigo, status) {
  return requisitar('/api/sensor/status/atualizar', {
    method: 'PUT',
    body: JSON.stringify({ codigo, status }),
  });
}

function formatarTipo(tipo) {
  const tipos = {
    luminosidade: 'Luminosidade',
    infravermelho: 'Infravermelho',
    temperatura: 'Temperatura',
    umidade: 'Umidade',
    rfid: 'RFID',
  };

  return tipos[String(tipo || '').toLowerCase()] || tipo || 'Tipo não informado';
}

function simboloTipo(tipo) {
  switch (String(tipo || '').toLowerCase()) {
    case 'temperatura':
      return '°';
    case 'umidade':
      return '%';
    case 'rfid':
      return 'ID';
    case 'infravermelho':
      return 'IR';
    case 'luminosidade':
      return 'LUX';
    default:
      return 'IoT';
  }
}

export default function App() {
  const [busca, setBusca] = useState('');
  const [sensores, setSensores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizandoLista, setAtualizandoLista] = useState(false);
  const [erroLista, setErroLista] = useState('');
  const [mensagens, setMensagens] = useState({});
  const [consultando, setConsultando] = useState({});
  const [atualizando, setAtualizando] = useState({});
  const [sensorDetalhe, setSensorDetalhe] = useState(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [erroDetalhe, setErroDetalhe] = useState('');

  const carregarSensores = useCallback(async (silencioso = false) => {
    if (silencioso) {
      setAtualizandoLista(true);
    } else {
      setCarregando(true);
    }

    setErroLista('');

    try {
      const dados = await listarSensoresApi();
      const normalizados = dados
        .filter((sensor) => sensor && sensor.codigo != null)
        .map((sensor) => ({
          ...sensor,
          codigo: String(sensor.codigo),
          tipo: String(sensor.tipo ?? ''),
          status: Number(sensor.status),
        }));

      setSensores(normalizados);
    } catch (error) {
      setErroLista(error?.message || 'Não foi possível carregar os sensores.');
    } finally {
      setCarregando(false);
      setAtualizandoLista(false);
    }
  }, []);

  useEffect(() => {
    carregarSensores();
  }, [carregarSensores]);

  const sensoresFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return sensores;

    return sensores.filter((sensor) =>
      sensor.codigo.toLowerCase().includes(termo) ||
      sensor.tipo.toLowerCase().includes(termo) ||
      formatarTipo(sensor.tipo).toLowerCase().includes(termo)
    );
  }, [busca, sensores]);

  const statusUm = sensores.filter((sensor) => sensor.status === 1).length;
  const statusZero = sensores.filter((sensor) => sensor.status === 0).length;

  async function consultarSensor(sensor) {
    const codigo = sensor.codigo;
    setSensorDetalhe({ ...sensor });
    setCarregandoDetalhe(true);
    setErroDetalhe('');
    setMensagens((anterior) => ({ ...anterior, [codigo]: '' }));

    try {
      const resultado = await consultarSensorApi(codigo);
      if (resultado.status === undefined || resultado.status === null) {
        throw new Error(resultado.message || resultado.error || 'A resposta não contém o status do sensor.');
      }

      const status = Number(resultado.status);
      const atualizado = { ...sensor, status };
      setSensorDetalhe(atualizado);
      setSensores((atuais) => atuais.map((item) =>
        item.codigo === codigo ? { ...item, status } : item
      ));
    } catch (error) {
      setErroDetalhe(error?.message || 'Falha ao consultar o sensor.');
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  async function atualizarStatus(codigo, novoStatus) {
    setAtualizando((anterior) => ({ ...anterior, [codigo]: true }));
    setMensagens((anterior) => ({ ...anterior, [codigo]: '' }));

    try {
      const resultado = await atualizarSensorApi(codigo, novoStatus);

      // Alguns backends retornam HTTP 200 com uma mensagem de erro de negócio.
      const mensagemBackend = String(resultado?.message || resultado?.error || '');
      const indicaFalha =
        Boolean(resultado?.error) ||
        /não encontrado|nao encontrado|não informado|nao informado|falha|inválid|invalid/i.test(mensagemBackend);

      if (indicaFalha) {
        throw new Error(mensagemBackend || 'O backend não confirmou a atualização.');
      }

      // Confirma o valor solicitado na interface e consulta novamente o servidor.
      setSensores((atuais) =>
        atuais.map((sensor) =>
          sensor.codigo === codigo ? { ...sensor, status: novoStatus } : sensor
        )
      );
      setSensorDetalhe((atual) => atual?.codigo === codigo ? { ...atual, status: novoStatus } : atual);

      setMensagens((anterior) => ({
        ...anterior,
        [codigo]: resultado?.message
          ? `Resposta da API: ${resultado.message}`
          : `Solicitação de atualização enviada para status ${novoStatus}.`,
      }));

      // Confere o estado efetivamente registrado no servidor.
      try {
        const verificado = await consultarSensorApi(codigo);
        if (verificado?.status !== undefined && verificado?.status !== null) {
          const statusReal = Number(verificado.status);
          setSensores((atuais) =>
            atuais.map((sensor) =>
              sensor.codigo === codigo ? { ...sensor, status: statusReal } : sensor
            )
          );
          setSensorDetalhe((atual) => atual?.codigo === codigo ? { ...atual, status: statusReal } : atual);
          setMensagens((anterior) => ({
            ...anterior,
            [codigo]: `Status confirmado pelo servidor: ${statusReal}.`,
          }));
        }
      } catch {
        // A atualização pode ter sido aceita; mantemos a resposta original visível.
      }
    } catch (error) {
      setMensagens((anterior) => ({
        ...anterior,
        [codigo]: error?.message || 'Não foi possível atualizar o status.',
      }));
    } finally {
      setAtualizando((anterior) => ({ ...anterior, [codigo]: false }));
    }
  }

  if (sensorDetalhe) {
    const ocupado = Boolean(atualizando[sensorDetalhe.codigo]);
    const ligado = sensorDetalhe.status === 1;

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F5F7FB" />
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable onPress={() => { setSensorDetalhe(null); setErroDetalhe(''); }} style={styles.backButton} accessibilityRole="button">
            <Text style={styles.backButtonText}>‹  Voltar para a lista</Text>
          </Pressable>

          <View style={styles.detailHeader}>
            <Text style={styles.eyebrow}>DETALHES DO SENSOR</Text>
            <Text style={styles.title}>{sensorDetalhe.codigo}</Text>
            <Text style={styles.subtitle}>Informações individuais do sensor selecionado</Text>
          </View>

          <View style={styles.detailCard}>
            <View style={styles.detailIcon}>
              <Text style={styles.detailIconText}>{simboloTipo(sensorDetalhe.tipo)}</Text>
            </View>
            <Text style={styles.detailType}>{formatarTipo(sensorDetalhe.tipo)}</Text>
            <Text style={styles.detailCode}>Código: {sensorDetalhe.codigo}</Text>
            <View style={[styles.statusBadge, ligado ? styles.statusBadgeOne : styles.statusBadgeZero, styles.detailStatusBadge]}>
              <Text style={[styles.statusText, ligado ? styles.statusTextOne : styles.statusTextZero, styles.detailStatusText]}>
                {ligado ? 'Ligado' : 'Desligado'}
              </Text>
            </View>
            {carregandoDetalhe ? (
              <View style={styles.detailLoading}>
                <ActivityIndicator size="small" color="#3458A5" />
                <Text style={styles.stateDescription}>Consultando informações no servidor...</Text>
              </View>
            ) : null}
            {erroDetalhe ? <Text style={styles.detailError}>{erroDetalhe}</Text> : null}
            <Pressable
              onPress={() => consultarSensor(sensorDetalhe)}
              disabled={carregandoDetalhe || ocupado}
              style={[styles.primaryButton, (carregandoDetalhe || ocupado) && styles.disabledButton]}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>Atualizar informações</Text>
            </Pressable>
          </View>

          <View style={styles.detailCard}>
            <Text style={styles.detailSectionTitle}>Controle de status</Text>
            <Text style={styles.stateDescription}>Escolha o status que deseja enviar para a API.</Text>
            <View style={styles.detailActions}>
              <Pressable
                onPress={() => atualizarStatus(sensorDetalhe.codigo, 1)}
                disabled={ocupado || carregandoDetalhe || sensorDetalhe.status === 1}
                style={[styles.detailActionButton, styles.statusOneButton, (ocupado || carregandoDetalhe || sensorDetalhe.status === 1) && styles.disabledButton]}
                accessibilityRole="button"
              >
                <Text style={styles.detailActionText}>Ligar</Text>
              </Pressable>
              <Pressable
                onPress={() => atualizarStatus(sensorDetalhe.codigo, 0)}
                disabled={ocupado || carregandoDetalhe || sensorDetalhe.status === 0}
                style={[styles.detailActionButton, styles.statusZeroButton, (ocupado || carregandoDetalhe || sensorDetalhe.status === 0) && styles.disabledButton]}
                accessibilityRole="button"
              >
                <Text style={styles.detailActionText}>Desligar</Text>
              </Pressable>
            </View>
            {mensagens[sensorDetalhe.codigo] ? <Text style={styles.sensorMessage}>{mensagens[sensorDetalhe.codigo]}</Text> : null}
          </View>
          <Text style={styles.footer}>Painel de monitoramento IoT</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F7FB" />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>INTERNET DAS COISAS</Text>
            <Text style={styles.title}>Sensores</Text>
            <Text style={styles.subtitle}>Acompanhe os registros do sistema</Text>
          </View>
          <View style={styles.headerIcon}>
            <Text style={styles.headerIconText}>IoT</Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total de sensores</Text>
          <Text style={styles.summaryNumber}>{sensores.length}</Text>
          <Text style={styles.summaryDescription}>Registros recebidos do backend</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={[styles.statusDot, styles.dotOne]} />
            <Text style={styles.statLabel}>Ligados</Text>
            <Text style={styles.statNumber}>{statusUm}</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statusDot, styles.dotZero]} />
            <Text style={styles.statLabel}>Desligados</Text>
            <Text style={styles.statNumber}>{statusZero}</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>Lista de sensores</Text>
            <Text style={styles.sectionSubtitle}>
              {sensoresFiltrados.length} registro(s) encontrado(s)
            </Text>
          </View>
          <Pressable
            onPress={() => carregarSensores(true)}
            disabled={carregando || atualizandoLista}
            style={styles.refreshButton}
            accessibilityRole="button"
          >
            <Text style={styles.refreshText}>
              {atualizandoLista ? 'Atualizando...' : 'Atualizar lista'}
            </Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por código ou tipo..."
          placeholderTextColor="#8A94A6"
          value={busca}
          onChangeText={setBusca}
          autoCapitalize="none"
          accessibilityLabel="Buscar sensores por código ou tipo"
        />

        {carregando ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color="#3458A5" />
            <Text style={styles.stateTitle}>Carregando sensores...</Text>
            <Text style={styles.stateDescription}>Buscando dados no servidor.</Text>
          </View>
        ) : erroLista ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Não foi possível carregar</Text>
            <Text style={styles.stateDescription}>{erroLista}</Text>
            <Pressable onPress={() => carregarSensores()} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Tentar novamente</Text>
            </Pressable>
          </View>
        ) : sensoresFiltrados.length === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Nenhum sensor encontrado</Text>
            <Text style={styles.stateDescription}>
              {sensores.length === 0
                ? 'A API não retornou sensores.'
                : 'Tente pesquisar por outro código ou tipo.'}
            </Text>
          </View>
        ) : (
          sensoresFiltrados.map((sensor) => {
            const ocupado = Boolean(consultando[sensor.codigo] || atualizando[sensor.codigo]);

            return (
              <View key={sensor.codigo} style={styles.sensorCard}>
                <View style={styles.sensorIcon}>
                  <Text style={styles.sensorIconText}>{simboloTipo(sensor.tipo)}</Text>
                </View>

                <View style={styles.sensorInfo}>
                  <Text style={styles.sensorCode}>{sensor.codigo}</Text>
                  <Text style={styles.sensorType}>{formatarTipo(sensor.tipo)}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      sensor.status === 1 ? styles.statusBadgeOne : styles.statusBadgeZero,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        sensor.status === 1 ? styles.statusTextOne : styles.statusTextZero,
                      ]}
                    >
                      {sensor.status === 1 ? 'Ligado' : 'Desligado'}
                    </Text>
                  </View>
                </View>

                <View style={styles.actions}>
                  <Pressable
                    onPress={() => consultarSensor(sensor)}
                    disabled={ocupado}
                    style={[styles.actionButton, ocupado && styles.disabledButton]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.actionButtonText}>
                      Consultar detalhes
                    </Text>
                  </Pressable>

                  <Text style={styles.updateLabel}>Definir status</Text>
                  <View style={styles.updateButtons}>
                    <Pressable
                      onPress={() => atualizarStatus(sensor.codigo, 1)}
                      disabled={ocupado || sensor.status === 1}
                      style={[
                        styles.smallButton,
                        styles.statusOneButton,
                        (ocupado || sensor.status === 1) && styles.disabledButton,
                      ]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.smallButtonText}>Ligar</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => atualizarStatus(sensor.codigo, 0)}
                      disabled={ocupado || sensor.status === 0}
                      style={[
                        styles.smallButton,
                        styles.statusZeroButton,
                        (ocupado || sensor.status === 0) && styles.disabledButton,
                      ]}
                      accessibilityRole="button"
                    >
                      <Text style={styles.smallButtonText}>Desligar</Text>
                    </Pressable>
                  </View>
                </View>

                {mensagens[sensor.codigo] ? (
                  <Text style={styles.sensorMessage}>{mensagens[sensor.codigo]}</Text>
                ) : null}
              </View>
            );
          })
        )}

        <Text style={styles.footer}>Painel de monitoramento IoT</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FB',
  },
  content: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 36,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 26,
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: '#6076A5',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: 7,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#17243B',
  },
  subtitle: {
    fontSize: 14,
    color: '#758096',
    marginTop: 6,
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#E3EAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: {
    color: '#4565B5',
    fontSize: 18,
    fontWeight: '800',
  },
  summaryCard: {
    backgroundColor: '#3458A5',
    borderRadius: 22,
    padding: 23,
    marginBottom: 15,
  },
  summaryLabel: {
    color: '#DDE6FF',
    fontSize: 14,
    fontWeight: '500',
  },
  summaryNumber: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '800',
    marginTop: 8,
  },
  summaryDescription: {
    color: '#DDE6FF',
    fontSize: 13,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 30,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 17,
    borderWidth: 1,
    borderColor: '#E8ECF3',
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginBottom: 12,
  },
  dotOne: {
    backgroundColor: '#38866B',
  },
  dotZero: {
    backgroundColor: '#D39A43',
  },
  statLabel: {
    color: '#758096',
    fontSize: 13,
  },
  statNumber: {
    color: '#17243B',
    fontSize: 27,
    fontWeight: '800',
    marginTop: 5,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 15,
  },
  sectionCopy: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#17243B',
  },
  sectionSubtitle: {
    color: '#758096',
    fontSize: 13,
    marginTop: 5,
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#E3EAFE',
    borderRadius: 10,
  },
  refreshText: {
    color: '#3458A5',
    fontSize: 12,
    fontWeight: '700',
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E3E8F1',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: '#17243B',
    marginBottom: 14,
  },
  sensorCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8ECF3',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  sensorIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: '#EDF1FC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sensorIconText: {
    color: '#4565B5',
    fontSize: 13,
    fontWeight: '800',
  },
  sensorInfo: {
    flex: 1,
    minWidth: 100,
  },
  sensorCode: {
    color: '#17243B',
    fontSize: 15,
    fontWeight: '800',
  },
  sensorType: {
    color: '#758096',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusBadgeOne: {
    backgroundColor: '#E5F4EC',
  },
  statusBadgeZero: {
    backgroundColor: '#FFF1DD',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusTextOne: {
    color: '#267452',
  },
  statusTextZero: {
    color: '#95621C',
  },
  actions: {
    alignItems: 'stretch',
    marginLeft: 10,
    gap: 7,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#E3EAFE',
    borderRadius: 9,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#3458A5',
    fontSize: 12,
    fontWeight: '700',
  },
  updateLabel: {
    color: '#758096',
    fontSize: 10,
    textAlign: 'center',
  },
  updateButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  smallButton: {
    flex: 1,
    minWidth: 64,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  statusOneButton: {
    backgroundColor: '#E5F4EC',
  },
  statusZeroButton: {
    backgroundColor: '#FFF1DD',
  },
  smallButtonText: {
    color: '#17243B',
    fontSize: 12,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.45,
  },
  sensorMessage: {
    flexBasis: '100%',
    color: '#4565A5',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E8ECF3',
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8ECF3',
    padding: 28,
  },
  stateTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#17243B',
    textAlign: 'center',
    marginTop: 8,
  },
  stateDescription: {
    color: '#758096',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: '#3458A5',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 2,
    marginBottom: 22,
  },
  backButtonText: {
    color: '#3458A5',
    fontSize: 15,
    fontWeight: '700',
  },
  detailHeader: {
    marginBottom: 22,
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#E8ECF3',
    marginBottom: 16,
  },
  detailIcon: {
    width: 66,
    height: 66,
    borderRadius: 20,
    backgroundColor: '#E3EAFE',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 15,
  },
  detailIconText: {
    color: '#3458A5',
    fontSize: 18,
    fontWeight: '800',
  },
  detailType: {
    color: '#17243B',
    fontSize: 23,
    fontWeight: '800',
    textAlign: 'center',
  },
  detailCode: {
    color: '#758096',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  detailStatusBadge: {
    alignSelf: 'center',
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  detailStatusText: {
    fontSize: 15,
  },
  detailLoading: {
    alignItems: 'center',
    marginTop: 18,
    gap: 8,
  },
  detailError: {
    color: '#B42318',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 14,
  },
  detailSectionTitle: {
    color: '#17243B',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  detailActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  detailActionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 11,
  },
  detailActionText: {
    color: '#17243B',
    fontSize: 14,
    fontWeight: '800',
  },
  footer: {
    textAlign: 'center',
    color: '#929BAA',
    fontSize: 12,
    marginTop: 24,
  },
});