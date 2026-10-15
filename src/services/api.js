
const API_BASE_URL = 'http://10.137.11.6';

export async function listarSensores() {
  let response;

  try {
    response = await fetch(
      `${API_BASE_URL}/api/sensor/status/listar`
    );
  } catch (error) {
    throw new Error(
      'Não foi possível conectar à API. Verifique a rede e o endereço do servidor.'
    );
  }

  let resultado;

  try {
    resultado = await response.json();
  } catch (error) {
    throw new Error(
      `A API retornou uma resposta inválida. HTTP ${response.status}.`
    );
  }

  if (!response.ok) {
    throw new Error(
      resultado.error ||
        resultado.message ||
        `Erro na API. HTTP ${response.status}.`
    );
  }

  if (!Array.isArray(resultado.data)) {
    throw new Error(
      'A resposta da API não contém uma lista válida no campo data.'
    );
  }

  return resultado.data;
}


export async function consultarStatusSensor(codigo) {
  let response;

  try {
    response = await fetch(
      `${API_BASE_URL}/api/sensor/status/visualizar/${encodeURIComponent(codigo)}`
    );
  } catch (error) {
    throw new Error(
      'Não foi possível conectar à API para consultar o sensor.'
    );
  }

  let resultado;

  try {
    resultado = await response.json();
  } catch (error) {
    throw new Error(
      `A API retornou uma resposta inválida. HTTP ${response.status}.`
    );
  }

  if (!response.ok) {
    throw new Error(
      resultado.error ||
        resultado.message ||
        `Erro ao consultar o sensor. HTTP ${response.status}.`
    );
  }

  if (resultado.status === undefined || resultado.status === null) {
    throw new Error(
      resultado.message ||
        resultado.error ||
        'A resposta não contém o status do sensor.'
    );
  }

  return resultado;
}
