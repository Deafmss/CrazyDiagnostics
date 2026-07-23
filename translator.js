// CrazyTranslator namespace containing mappers and parser rules
const CrazyTranslator = {
  // Category colors and metadata
  CATEGORIES: {
    META: { name: 'WhatsApp Oficial (Meta)', class: 'tag-meta', severity: 'critical' },
    UNOFFICIAL: { name: 'API Não Oficial', class: 'tag-unofficial', severity: 'warning' },
    UNIVERSAL: { name: 'Conexão Universal', class: 'tag-universal', severity: 'critical' },
    DATABASE: { name: 'Banco de Dados (Prisma)', class: 'tag-database', severity: 'critical' },
    CONSOLE: { name: 'Erro de Código / Console', class: 'tag-console', severity: 'info' },
    SYSTEM: { name: 'Erro de Sistema', class: 'tag-system', severity: 'critical' },
    UI_ALERT: { name: 'Alerta da Interface', class: 'tag-uialert', severity: 'warning' }
  },

  // 1. Meta WhatsApp Cloud API Error Codes
  META_ERRORS: {
    '131031': {
      title: 'Conta de WhatsApp Business Bloqueada (Meta)',
      meaning: 'O CRM tentou enviar uma mensagem, mas a Meta (Facebook) recusou o envio e bloqueou o canal. Isso acontece porque a sua Conta do WhatsApp Business (WABA) sofreu uma suspensão ou bloqueio oficial na Meta (geralmente por falta de envio de documentos empresariais ou violação de políticas comerciais), impedindo qualquer nova atividade de envio até que a pendência seja resolvida no painel do Facebook.',
      solution: [
        'Acesse a <strong>Meta Business Suite</strong> vinculada à conta.',
        'Vá na aba <strong>Qualidade da Conta</strong> (Account Quality) ou Suporte Empresarial.',
        'Verifique o motivo da suspensão (ex: falta de documentos, pendência de cobrança ou excesso de denúncias de spam) e solicite uma revisão oficial da Meta.'
      ]
    },
    '131037': {
      title: 'Nome de Exibição Rejeitado ou Não Aprovado',
      meaning: 'O CRM tentou disparar uma mensagem oficial, mas o envio falhou porque o nome do remetente (Display Name) configurado no número de telefone ainda não foi aprovado pela Meta. Sem um nome de exibição verificado e ativo no Facebook Developers, o número fica impossibilitado de enviar mensagens.',
      solution: [
        'Acesse o <strong>Gerenciador do WhatsApp</strong> na Meta Business Suite.',
        'Vá na seção "Números de Telefone" e verifique a situação do nome do número.',
        'O status precisa estar como <strong>Aprovado</strong>. Se foi rejeitado, altere o nome seguindo as diretrizes de marcas da Meta e envie para nova análise.'
      ]
    },
    '131026': {
      title: 'Mensagem Não Entregue (Número sem WhatsApp)',
      meaning: 'O CRM enviou a mensagem com sucesso, mas a operadora ou o WhatsApp não conseguiu entregá-la no celular do cliente. Isso ocorre porque o telefone de destino não possui uma conta de WhatsApp ativa no dispositivo ou o número foi cadastrado no CRM no formato incorreto (faltando DDI ou com DDD/9º dígito incorretos).',
      solution: [
        'Verifique se o número do lead realmente está ativo no WhatsApp.',
        'Certifique-se de que o número do cliente foi salvo no formato internacional correto (ex: com DDI e sem o 9 extra de algumas regiões, se aplicável).',
        'O número pode ter bloqueado a sua conta comercial ou não aceitou os últimos termos de serviço do WhatsApp.'
      ]
    },
    '131030': {
      title: 'Destinatário Fora da Lista de Teste (Modo Desenvolvimento)',
      meaning: 'O CRM tentou enviar uma mensagem de teste, mas a chamada foi rejeitada pela Meta. Isso ocorre porque o seu aplicativo oficial no Facebook está em modo sandbox (desenvolvimento) e o número do destinatário final não foi registrado e verificado como um número de teste autorizado nas configurações da API.',
      solution: [
        'Acesse o painel <strong>developers.facebook.com</strong> e abra o seu aplicativo.',
        'No menu lateral esquerdo, vá em WhatsApp > Configurações de API.',
        'No painel direito, sob "Destinatários de Teste", adicione e verifique o número do lead para o qual você deseja enviar a mensagem.'
      ]
    },
    '132018': {
      title: 'Erro de Validação de Template (Variáveis Incorretas)',
      meaning: 'O CRM tentou preencher um modelo de mensagem (Template) para enviar ao cliente, mas a API da Meta barrou. Isso acontece porque a quantidade de variáveis passadas (ex: {{1}}, {{2}}) ou a estrutura das informações enviadas no bloco de automação do DataCrazy não bate com o formato exato que foi cadastrado e aprovado para aquele template no painel do Facebook.',
      solution: [
        'Abra o fluxo de automação do DataCrazy que apresentou o erro.',
        'Confira o bloco de envio de mensagens e verifique o número e tipo de variáveis inseridas.',
        'Acesse o WhatsApp Manager na Meta e garanta que o layout do template aprovado exige exatamente a mesma quantidade de variáveis que você configurou no CRM.'
      ]
    },
    '131042': {
      title: 'Falha de Pagamento na Conta da Meta',
      meaning: 'O envio de mensagens falhou por recusa financeira. Isso significa que a conta do WhatsApp Business da Meta atingiu o seu limite de cobrança permitido ou não possui uma forma de pagamento ativa/válida cadastrada nas configurações da WABA, suspendendo temporariamente os disparos automáticos.',
      solution: [
        'Acesse o painel do Gerenciador de Negócios da Meta (Meta Business Manager).',
        'Vá em Cobranças e Formas de Pagamento.',
        'Atualize os dados do cartão de crédito cadastrado ou salde faturas pendentes da WABA para liberar o envio das mensagens.'
      ]
    },
    '131048': {
      title: 'Limite de Taxa de Spam Excedido (Bloqueio Temporário)',
      meaning: 'O CRM tentou disparar mensagens, mas a Meta bloqueou temporariamente o seu número. Isso acontece porque o seu número comercial sofreu um alto índice de denúncias de spam ou bloqueios por parte dos clientes que receberam suas mensagens recentemente, fazendo com que a Meta derrubasse a qualidade do número comercial para nível Crítico.',
      solution: [
        'Vá em Gerenciador do WhatsApp > Qualidade do Telefone para ver o nível de qualidade (estará Vermelho ou Laranja).',
        'Aguarde o período de punição da Meta (normalmente 24h a 48h) sem realizar novos disparos automáticos.',
        'Revise a sua lista de contatos para garantir que você só envia mensagens para usuários que autorizaram o contato (opt-in), reduzindo as denúncias.'
      ]
    },
    '130429': {
      title: 'Limite de Requisições da Meta Excedido (Rate Limit)',
      meaning: 'O envio falhou por sobrecarga. Isso acontece porque a quantidade de mensagens automáticas que o seu CRM tentou enviar em um curto espaço de tempo ultrapassou o limite máximo de requisições por segundo permitido pela sua categoria de conta da API da Meta.',
      solution: [
        'Ajuste o fluxo de disparos automáticos para criar intervalos de atraso (delay) maiores entre cada mensagem no CRM.',
        'Acesse o gerenciador da Meta Business e consulte o seu limite de mensagens diárias (Message Tier limit) para solicitar um aumento de categoria se necessário.'
      ]
    },
    '135000': {
      title: 'Erro de Validação ou Sessão (Meta Cloud API)',
      meaning: 'A Meta rejeitou o envio da mensagem. Isso acontece geralmente quando o CRM tenta enviar uma mensagem interativa comum ou um fluxo com botões de resposta rápida para um cliente que não responde há mais de 24 horas, o que é proibido pelas regras da Meta (que exige o uso de um Template pré-aprovado para reatar contato após a janela de 24h).',
      solution: [
        'Se você está iniciando o contato agora, lembre-se de que a Meta exige um <strong>Template de Mensagem Aprovado</strong>. Você não pode enviar mensagens normais com botões de resposta rápida fora da janela de 24h de interação do cliente.',
        'Se você já estiver usando um template, revise os parâmetros variáveis (como {{1}}, {{2}}). Certifique-se de que eles não contêm emojis (como o coração 💛), links suspeitos ou textos longos demais.',
        'Confirme se o template está ativo e aprovado no painel Meta Business Manager.'
      ]
    },
    '131047': {
      title: 'Template de Mensagem Obrigatório (Janela de 24h)',
      meaning: 'O CRM tentou enviar uma mensagem comum ao cliente, mas a Meta rejeitou porque a janela de conversa de 24 horas expirou. Após 24 horas sem resposta do cliente, a Meta exige obrigatoriamente o uso de um Template de Mensagem pré-aprovado para restabelecer o contato.',
      solution: [
        'Utilize um <strong>Template de Mensagem</strong> aprovado pela Meta para reabrir a conversa.',
        'Verifique no painel do WhatsApp Manager se o template desejado está com status <strong>Aprovado</strong>.',
        'Após o cliente responder, a janela de 24 horas será reaberta automaticamente para mensagens livres.'
      ]
    },
    '131009': {
      title: 'Payload de Mídia ou Documento Mal Formado',
      meaning: 'O CRM tentou enviar uma imagem, vídeo, documento ou áudio, mas a requisição foi rejeitada pela Meta. Isso ocorre porque o formato do arquivo, o tamanho ou a URL fornecida para o anexo são inválidos ou incompatíveis com os requisitos da API do WhatsApp.',
      solution: [
        'Verifique se o arquivo enviado está em um formato suportado pelo WhatsApp (JPG, PNG, PDF, MP4, OGG, etc.).',
        'Confirme que o tamanho do arquivo não excede os limites da Meta (16 MB para mídias, 100 MB para documentos).',
        'Se estiver usando uma URL pública, garanta que ela seja acessível e retorne o Content-Type correto.'
      ]
    },
    '131021': {
      title: 'Número do Remetente Inativo ou Offline (Meta)',
      meaning: 'O CRM tentou enviar uma mensagem, mas o número de telefone remetente configurado na WABA está inativo, offline ou não está registrado corretamente na plataforma Meta.',
      solution: [
        'Acesse o <strong>WhatsApp Manager</strong> na Meta Business Suite e verifique o status do número remetente.',
        'Certifique-se de que o número está <strong>Verificado</strong> e com status <strong>Conectado</strong>.',
        'Se o número foi migrado recentemente, aguarde até 48 horas para a ativação completa.'
      ]
    }
  },

  // Heuristic cleanup for database or technical prisma logs
  PRISMA_ERRORS: {
    'P2001': {
      title: 'Registro Não Encontrado no Banco de Dados',
      meaning: 'O banco de dados do CRM procurou por um registro específico na tabela, mas o ID fornecido não pôde ser localizado.',
      solution: [
        'Verifique se a ID do registro foi deletada por outro usuário ou alterada.',
        'Atualize a tela para sincronizar os dados locais com o servidor.'
      ]
    },
    'P2002': {
      title: 'Registro Duplicado no CRM (Unique Constraint)',
      meaning: 'O CRM tentou salvar um registro (ex: Lead ou Contato), mas o e-mail, telefone ou documento já está cadastrado em outro contato.',
      solution: [
        'Busque pelo e-mail, telefone ou documento na aba de Contatos do CRM.',
        'Mescle os contatos caso sejam duplicados, ou use dados diferentes e tente salvar novamente.'
      ]
    },
    'P2003': {
      title: 'Inconsistência de Relação no Banco de Dados',
      meaning: 'O CRM tentou vincular um elemento (ex: Atividade ou Negócio) a um lead que foi deletado ou não existe mais.',
      solution: [
        'Recarregue a página do lead ou negócio.',
        'Certifique-se de que o registro pai (lead) ainda existe no banco antes de criar novos anexos ou notas.'
      ]
    },
    'P2010': {
      title: 'Falha em Consulta SQL Direta no Banco',
      meaning: 'Uma consulta customizada (Raw Query) enviada ao banco de dados falhou por erro de sintaxe ou incompatibilidade de dados.',
      solution: [
        'Abra a aba Técnico para copiar o relatório e encaminhar à equipe de desenvolvimento do CRM.'
      ]
    },
    'P2024': {
      title: 'Tempo de Conexão Esgotado com o Banco de Dados',
      meaning: 'O servidor do CRM tentou falar com o banco de dados, mas a conexão demorou demais e estourou o tempo limite de espera (Timeout).',
      solution: [
        'Aguarde alguns segundos e recarregue a página com F5.',
        'Isso geralmente indica uma lentidão temporária ou pico de tráfego no banco de dados do DataCrazy.'
      ]
    },
    'P2025': {
      title: 'Registro Não Encontrado no Servidor',
      meaning: 'Uma operação tentou atualizar ou excluir um dado no banco que não pôde ser localizado (provavelmente deletado por outro usuário).',
      solution: [
        'Atualize a página do CRM com um F5 para sincronizar os dados da tela com o servidor.',
        'Confirme com sua equipe se o lead ou negócio foi removido recentemente.'
      ]
    },
    'P2011': {
      title: 'Campo Obrigatório Vazio (Null Constraint)',
      meaning: 'O CRM tentou salvar um registro no banco de dados, mas um campo marcado como obrigatório foi enviado vazio ou nulo. Isso geralmente ocorre quando um formulário é submetido sem preencher todos os campos necessários.',
      solution: [
        'Verifique se todos os campos obrigatórios do formulário foram preenchidos antes de salvar.',
        'Recarregue a página e tente novamente, garantindo que nenhum campo fique em branco.',
        'Se o erro persistir, pode ser um bug no formulário do CRM — reporte à equipe de desenvolvimento.'
      ]
    },
    'P2014': {
      title: 'Violação de Relação na Exclusão (Foreign Key)',
      meaning: 'O CRM tentou deletar um registro que ainda possui outros registros vinculados a ele (ex: um Lead com atividades, negócios ou fluxos de automação atrelados). O banco de dados impediu a exclusão para proteger a integridade dos dados.',
      solution: [
        'Antes de excluir o registro principal, remova ou desvincule todos os itens dependentes (atividades, negócios, notas).',
        'Se não for possível remover manualmente, use a opção de exclusão em cascata (se disponível no CRM).',
        'Recarregue a página e confirme com a equipe se o registro pode ser arquivado em vez de deletado.'
      ]
    }
  },

  BUG_TYPES: {
    'BUG_SLOW_API': {
      title: 'Bug de Performance: API Lenta',
      meaning: 'Uma requisição do CRM demorou mais de 10 segundos para receber resposta do servidor. Isso indica que o backend está sobrecarregado, há uma query lenta no banco de dados, ou existe um problema de rede entre o CRM e o servidor.',
      solution: [
        'Verifique a <strong>saúde do servidor</strong> e o uso de CPU/memória no backend.',
        'Analise os <strong>logs do banco de dados</strong> para identificar queries lentas (slow queries).',
        'Se o problema ocorre em horários de pico, considere <strong>escalar a infraestrutura</strong> (mais recursos no servidor).',
        'Caso seja recorrente em um endpoint específico, reporte à equipe de desenvolvimento para otimização.'
      ]
    },
    'BUG_EMPTY_RESPONSE': {
      title: 'Bug: Dados Vazios na Resposta',
      meaning: 'O servidor respondeu com sucesso (HTTP 200), porém não retornou nenhum dado. Isso pode indicar um filtro incorreto no backend, falta de permissão do usuário para acessar os dados, banco de dados desconectado ou vazio, ou um bug na lógica de consulta do servidor.',
      solution: [
        'Verifique se o <strong>usuário possui permissão</strong> para acessar os dados solicitados.',
        'Confirme se os <strong>filtros de busca</strong> não estão eliminando todos os resultados.',
        'Verifique a <strong>conexão com o banco de dados</strong> no painel de administração.',
        'Se o endpoint deveria retornar dados e está vazio, <strong>reporte como bug</strong> à equipe de desenvolvimento.'
      ]
    },
    'BUG_REQUEST_LOOP': {
      title: 'Bug: Loop de Requisições Detectado',
      meaning: 'O CRM está enviando a mesma requisição repetidamente em um curto intervalo de tempo. Isso geralmente indica um bug no código frontend onde um componente React está re-renderizando indefinidamente, um useEffect mal configurado, ou uma lógica de retry sem limite que não para de reenviar a mesma chamada.',
      solution: [
        'Este é um <strong>bug de frontend</strong> que precisa ser corrigido pela equipe de desenvolvimento.',
        'O componente que dispara a requisição provavelmente tem uma <strong>dependência circular</strong> no useEffect ou state.',
        'Tente <strong>recarregar a página</strong> (F5) para interromper o loop temporariamente.',
        'Se persistir após recarregar, <strong>reporte o bug</strong> com a URL do endpoint afetado.'
      ]
    },
    'API_VALIDATION_ERROR': {
      title: 'Erro de Validação de Dados',
      meaning: 'O servidor rejeitou os dados enviados pelo CRM porque um ou mais campos estão inválidos, faltando ou com formato incorreto. Isso pode acontecer quando um formulário é enviado com campos obrigatórios vazios, formatos inválidos (como email sem @), ou valores fora do range permitido.',
      solution: [
        'Revise o <strong>formulário ou ação</strong> que originou o erro e verifique todos os campos obrigatórios.',
        'Certifique-se de que emails, telefones e datas estão no <strong>formato correto</strong>.',
        'Se todos os campos parecem corretos, pode ser uma <strong>regra de validação do backend</strong> que precisa ser ajustada.'
      ]
    },
    'GRAPHQL_ERROR': {
      title: 'Erro na Consulta GraphQL',
      meaning: 'A API GraphQL retornou um erro na consulta. Isso pode ser causado por uma query mal formada, campos solicitados que não existem no schema, falta de permissão para acessar determinados dados, ou um erro interno no resolver do servidor.',
      solution: [
        'Verifique se o <strong>schema da API</strong> foi atualizado recentemente (campos removidos ou renomeados).',
        'Confirme as <strong>permissões do usuário</strong> para os dados solicitados.',
        'Se persistir, <strong>reporte à equipe de backend</strong> com a mensagem de erro e o campo afetado.'
      ]
    },
    'SECURITY_JWT_EXPIRED': {
      title: 'Segurança: Token JWT Expirado',
      meaning: 'O token de autenticação (JWT) do usuário expirou. Todas as requisições subsequentes serão rejeitadas pelo servidor com erro 401. Isso acontece quando a sessão fica aberta por muito tempo sem renovação, ou quando o servidor de autenticação reinicia e invalida tokens antigos.',
      solution: [
        '<strong>Recarregue a página</strong> (F5) para forçar um novo login e obter um token válido.',
        'Se o problema persistir após recarregar, <strong>faça logout e login novamente</strong>.',
        'Caso ocorra frequentemente, verifique a <strong>configuração de tempo de expiração do JWT</strong> no servidor (recomendado: 8-24 horas).'
      ]
    },
    'SECURITY_JWT_EXPIRING': {
      title: 'Aviso: Sessão Expirando em Breve',
      meaning: 'O token de autenticação do usuário vai expirar nos próximos minutos. Após a expiração, o CRM pode parar de funcionar e exibir erros de autenticação em todas as ações.',
      solution: [
        'Recomendado: <strong>Recarregue a página</strong> agora para renovar a sessão automaticamente.',
        'Se houver trabalho não salvo, <strong>salve antes de recarregar</strong>.',
        'Para evitar este aviso, o backend pode implementar <strong>refresh tokens</strong> automáticos.'
      ]
    },
    'SECURITY_AUTH_FAILURE': {
      title: 'Falha de Autenticação/Permissão',
      meaning: 'O servidor rejeitou uma requisição por falta de autenticação (401) ou falta de permissão (403). Isso pode significar que o token expirou, que o usuário não tem o perfil/role necessário para a ação, ou que a sessão foi invalidada por outro login.',
      solution: [
        'Verifique se o <strong>token de sessão ainda é válido</strong> (recarregue a página se necessário).',
        'Confirme que o usuário possui as <strong>permissões necessárias</strong> para esta ação no CRM.',
        'Se o erro ocorre após ficar inativo, o backend pode estar <strong>expirando sessões ociosas</strong>.'
      ]
    },
    'BUG_DOUBLE_SUBMIT': {
      title: 'Bug de UI: Duplo Envio Detectado',
      meaning: 'O CRM enviou a mesma requisição duas vezes em menos de 500ms. Isso indica que o botão ou ação não possui proteção contra clique duplo (debounce/throttle). O duplo envio pode causar dados duplicados, cobranças em dobro, mensagens repetidas, ou erros de constraint no banco de dados.',
      solution: [
        'Este é um <strong>bug de frontend</strong> que precisa de correção pela equipe de desenvolvimento.',
        'O botão deveria ter <strong>debounce</strong> (desabilitar após o primeiro clique até a resposta chegar).',
        'Para contornar temporariamente, <strong>evite clicar rapidamente</strong> nos botões de ação.',
        'Reporte o bug indicando qual <strong>botão e página</strong> permitem o duplo envio.'
      ]
    }
  },

  BUG_PATTERNS: {
    'unstable_endpoint': {
      title: 'Bug: Endpoint Instável',
      meaning: 'Esta rota do servidor está falhando repetidamente (3+ vezes em 5 minutos). Isso indica um problema persistente no backend, como um serviço caído, banco de dados inacessível, ou um bug no código do servidor que causa falhas intermitentes.',
      solution: [
        'Verifique o <strong>status do servidor</strong> e dos serviços dependentes (banco de dados, filas, cache).',
        'Analise os <strong>logs do backend</strong> para a rota afetada.',
        'Se o servidor estiver operacional, pode ser um <strong>bug no código</strong> que precisa de correção urgente.',
        'Considere ativar um <strong>modo de manutenção</strong> se o problema afetar múltiplos endpoints.'
      ]
    },
    'unstable_websocket': {
      title: 'Bug: Conexão WebSocket Instável',
      meaning: 'A conexão WebSocket (tempo real) está caindo e reconectando repetidamente (3+ vezes em 5 minutos). Isso pode ser causado por instabilidade na rede, servidor de WebSocket sobrecarregado, firewall/proxy cortando conexões longas, ou um bug no gerenciamento de conexões do backend.',
      solution: [
        'Verifique a <strong>estabilidade da rede</strong> (Wi-Fi, cabo, VPN).',
        'Confirme que nenhum <strong>firewall ou proxy</strong> está cortando conexões WebSocket.',
        'Verifique a <strong>saúde do servidor de WebSocket</strong> (Socket.io, Engine.io).',
        'Se estiver usando <strong>balanceador de carga</strong>, verifique se o sticky sessions está configurado.'
      ]
    }
  },

  translateEnglishMessage: function(errMsg) {
    if (!errMsg) return null;
    const lower = errMsg.toLowerCase();

    // 1. Unsupported post request / ID does not exist / GraphMethodException
    if (lower.includes('unsupported post request') || (lower.includes('object with id') && lower.includes('does not exist'))) {
      return {
        title: 'ID de Telefone ou Permissões Inválidas na Meta',
        meaning: 'O identificador do número de WhatsApp (Phone Number ID) configurado no CRM está incorreto, inexistente ou o token do sistema não tem permissão para acessá-lo.',
        solution: [
          'Confirme se o <strong>ID do Número de Telefone (Phone Number ID)</strong> e o <strong>WABA ID</strong> inseridos no canal do DataCrazy são exatamente os mesmos exibidos no painel do Facebook Developers.',
          'Verifique se o aplicativo e a conta de WhatsApp pertencem ao mesmo Gerenciador de Negócios (Business Manager).',
          'Certifique-se de que o token de acesso permanente foi gerado pelo Usuário do Sistema (System User) correto e que possui as permissões <strong>whatsapp_business_messaging</strong> e <strong>whatsapp_business_management</strong> vinculadas a este número.'
        ]
      };
    }

    // 2. Missing permissions / permissions
    if (lower.includes('missing permissions') || (lower.includes('permissions') && lower.includes('does not support'))) {
      return {
        title: 'Token da Meta sem Permissão de Acesso',
        meaning: 'O token de acesso configurado no CRM não tem permissão para gerenciar o número de telefone ou realizar o envio de mensagens oficiais.',
        solution: [
          'Acesse o painel <strong>developers.facebook.com</strong> e vá em Configurações do Negócio.',
          'Associe o Usuário do Sistema (System User) ao aplicativo e ao número de telefone do WhatsApp com controle total.',
          'Gere um novo Token de Acesso permanente marcando as caixas <strong>whatsapp_business_messaging</strong> e <strong>whatsapp_business_management</strong>.'
        ]
      };
    }

    // 3. Billing / Payment / Financial
    if (lower.includes('billing') || lower.includes('payment') || lower.includes('credit') || lower.includes('financial') || lower.includes('limit reached')) {
      return {
        title: 'Pendência Financeira na Conta da Meta',
        meaning: 'A Meta bloqueou o envio de mensagens porque a conta de WhatsApp Business não possui uma forma de pagamento válida cadastrada ou atingiu o limite de crédito disponível.',
        solution: [
          'Acesse o <strong>Meta Business Manager</strong> da empresa e vá na seção Cobranças.',
          'Verifique se o cartão de crédito associado à conta de WhatsApp expirou ou foi recusado.',
          'Adicione um cartão válido ou regularize faturas em aberto para reestabelecer o serviço imediatamente.'
        ]
      };
    }

    // 4. Token expired / Invalid credentials
    if (lower.includes('token expired') || lower.includes('invalid credential') || lower.includes('access token') || lower.includes('authentication')) {
      return {
        title: 'Token de Acesso da Meta Expirado',
        meaning: 'O token permanente do Facebook (Meta) integrado ao CRM expirou, foi alterado ou revogado pela segurança da plataforma.',
        solution: [
          'Vá ao painel de desenvolvedores do Facebook e gere um novo token permanente do usuário do sistema.',
          'Atualize as credenciais no painel de canais de atendimento do DataCrazy.',
          'Certifique-se de não redefinir a senha do usuário administrador no Facebook, o que pode revogar tokens existentes.'
        ]
      };
    }

    // 5. Template variables mismatch
    if (lower.includes('template') && (lower.includes('variable') || lower.includes('parameter') || lower.includes('mismatch') || lower.includes('invalid format'))) {
      return {
        title: 'Formato ou Parâmetro do Template Inválido',
        meaning: 'Os dados dinâmicos (variáveis) fornecidos para o template de mensagem não correspondem à estrutura aprovada e cadastrada no painel da Meta.',
        solution: [
          'Confira a quantidade e ordem das variáveis (ex: {{1}}, {{2}}) configuradas no bloco do fluxo de automação.',
          'Garanta que você não está enviando valores vazios ou caracteres inválidos (como emojis ou links longos) em variáveis numéricas ou de data.',
          'Compare a mensagem configurada no DataCrazy com o template aprovado no WhatsApp Manager.'
        ]
      };
    }

    // 6. Number not registered on WhatsApp (Graph API)
    if (lower.includes('not registered') || lower.includes('is not a valid') || lower.includes('user is not on whatsapp')) {
      return {
        title: 'Destinatário sem WhatsApp Ativo',
        meaning: 'O número de telefone do lead informado não possui uma conta de WhatsApp ativa ou o número foi informado em formato incorreto.',
        solution: [
          'Verifique se o número do cliente está correto e possui WhatsApp ativo no aparelho.',
          'Certifique-se de que o número está salvo com o DDI (ex: 55 para o Brasil) e o DDD corretos.',
          'Tente enviar uma mensagem de teste para o número a partir de um WhatsApp comum.'
        ]
      };
    }

    return null;
  },

  translatePortugueseMessage: function(errMsg) {
    if (!errMsg) return null;
    const lower = errMsg.toLowerCase();

    if (lower.includes('parametros de solicitacao') || lower.includes('parâmetros de solicitação') || lower.includes('parametro de solicitacao') || lower.includes('parâmetro de solicitação')) {
      return {
        title: 'Parâmetro de Solicitação Inválido (Meta)',
        meaning: 'A Meta (WhatsApp Cloud API) rejeitou a mensagem porque um ou mais parâmetros enviados (como variáveis do template, links ou campos dinâmicos) estão incorretos ou incompatíveis.',
        solution: [
          'Revise o bloco do fluxo e confirme se todas as variáveis estão preenchidas e sem caracteres proibidos.',
          'Certifique-se de que a quantidade e formato das variáveis de template enviados estão de acordo com o modelo aprovado na Meta.',
          'Abra a aba Técnico para copiar a mensagem bruta do erro e analisar os parâmetros rejeitados.'
        ]
      };
    }

    if (lower.includes('janela de 24') || lower.includes('24 horas') || lower.includes('expirada')) {
      return {
        title: 'Janela de Mensagens de 24 Horas Fechada',
        meaning: 'O prazo de 24 horas desde a última interação do cliente expirou. A política da Meta proíbe o envio de mensagens normais fora dessa janela.',
        solution: [
          'Utilize um modelo de mensagem (Template) aprovado pela Meta para reabrir o contato com o cliente.',
          'Evite o envio de textos livres ou mídias comuns enquanto o cliente não responder.'
        ]
      };
    }

    if (lower.includes('restringida') || lower.includes('desabilitada') || lower.includes('politica da plataforma') || lower.includes('política da plataforma')) {
      return {
        title: 'Conta de Negócios Restringida (Meta)',
        meaning: 'A conta do WhatsApp Business ou o número de telefone foi restringido/desabilitado pela Meta por violação de políticas comerciais.',
        solution: [
          'Acesse o painel do Facebook Business Manager e vá em Qualidade da Conta.',
          'Verifique se há alguma contestação pendente ou violação de diretrizes comerciais.'
        ]
      };
    }

    return null;
  },

  // Main translation routing function
  translate: function(entry) {
    if (!entry) return null;

    // Bug Pattern overlay (takes priority in title display)
    if (entry.bugPattern) {
      const patternInfo = this.BUG_PATTERNS[entry.bugPattern.bugType];
      if (patternInfo) {
        return {
          title: patternInfo.title + ` (${entry.bugPattern.failCount || entry.bugPattern.disconnectCount}x em ${entry.bugPattern.windowMinutes} min)`,
          meaning: patternInfo.meaning,
          solution: patternInfo.solution,
          categoryClass: 'tag-system',
          categoryLabel: 'Bug Detectado',
          gatewayName: null
        };
      }
    }

    // Direct Bug Type translations
    const bugTypeInfo = this.BUG_TYPES[entry.type];
    if (bugTypeInfo) {
      let title = bugTypeInfo.title;
      if (entry.type === 'BUG_SLOW_API' && entry.data?.durationSeconds) {
        title += ` (${entry.data.durationSeconds}s)`;
      }
      if (entry.type === 'BUG_REQUEST_LOOP' && entry.data?.count) {
        title += ` (${entry.data.count}x)`;
      }
      return {
        title: title,
        meaning: bugTypeInfo.meaning,
        solution: bugTypeInfo.solution,
        categoryClass: 'tag-system',
        categoryLabel: entry.type.startsWith('BUG_') ? 'Bug Detectado' : (entry.type.startsWith('SECURITY_') ? 'Segurança' : 'Sistema'),
        gatewayName: null
      };
    }

    let title = 'Erro Indefinido';
    let categoryKey = 'SYSTEM';
    let meaning = 'Não foi possível interpretar este erro de forma automatizada.';
    let solution = ['Abra a aba Técnico para copiar o JSON completo do log de erro e encaminhar para a equipe de TI ou suporte do CRM.'];
    let severity = 'warning';
    let gatewayName = null;

    const type = entry.type;
    const data = entry.data || {};

    // A. ERROR DETECTED ON SYSTEM EXCEPTIONS OR CONSOLE
    if (type === 'RUNTIME_EXCEPTION' || type === 'UNHANDLED_PROMISE_REJECTION') {
      categoryKey = 'CONSOLE';
      severity = 'critical';
      const msg = data.message || '';
      
      if (msg.includes('PrismaClient') || msg.includes('prisma:')) {
        categoryKey = 'DATABASE';
        title = 'Erro de Banco de Dados Interno';
        meaning = 'Ocorreu um erro no motor de banco de dados (Prisma Client) durante o processamento da página.';
        solution = ['Recarregue a página com F5.', 'Se o problema persistir, pode ser uma instabilidade temporária no servidor do banco do DataCrazy.'];
        
        // Match specific Prisma code
        const pMatch = msg.match(/(P\d{4})/);
        if (pMatch && this.PRISMA_ERRORS[pMatch[1]]) {
          const pErr = this.PRISMA_ERRORS[pMatch[1]];
          title = pErr.title;
          meaning = pErr.meaning;
          solution = pErr.solution;
        }
      } else if (msg.toLowerCase().includes('failed to fetch') || msg.includes('networkerror')) {
        categoryKey = 'SYSTEM';
        title = 'Sem Conexão com o Servidor';
        meaning = 'O navegador tentou enviar ou buscar dados no CRM, mas não conseguiu contato com a internet ou o servidor do DataCrazy está fora do ar.';
        solution = [
          'Verifique a sua conexão de internet local.',
          'Consulte se outros sites estão carregando normalmente.',
          'Verifique se o endereço do CRM não está bloqueado por antivírus, firewall ou proxy empresarial.'
        ];
      } else {
        title = 'Exceção de JavaScript';
        meaning = `Ocorreu um crash interno no código da página: "${msg}"`;
        solution = [
          'Tente atualizar a página.',
          'Se ocorrer ao clicar em um botão específico, pode ser um bug no frontend do CRM. Abra a aba Técnico e copie o relatório para o time de suporte.'
        ];
      }
    }

    else if (type === 'CONSOLE_ERROR') {
      categoryKey = 'CONSOLE';
      const msg = data.message || '';
      title = 'Erro de Console Registrado';
      meaning = `O CRM registrou uma mensagem de erro interna: "${msg}"`;
      solution = ['Geralmente estes erros são internos e não afetam o uso, a menos que algum botão ou tela trave. Recarregue a página se isso ocorrer.'];

      // Catch database errors logged to console
      if (msg.includes('P2002') || msg.includes('P2003') || msg.includes('P2025')) {
        categoryKey = 'DATABASE';
        const pMatch = msg.match(/(P\d{4})/);
        if (pMatch && this.PRISMA_ERRORS[pMatch[1]]) {
          const pErr = this.PRISMA_ERRORS[pMatch[1]];
          title = pErr.title;
          meaning = pErr.meaning;
          solution = pErr.solution;
        }
      }
    }

    // B. UI TOAST ERRORS (Captured from the DOM Alerts)
    else if (type === 'UI_TOAST_ERROR') {
      categoryKey = 'UI_ALERT';
      const msg = data.message || '';
      title = 'Aviso de Erro Exibido na Tela';
      meaning = `O CRM exibiu um alerta vermelho na interface com o seguinte texto: "${msg}"`;
      solution = ['Siga as instruções descritas no próprio balão de alerta para corrigir o problema.'];

      const lowerMsg = msg.toLowerCase().trim();
      const ctx = data.context || {};

      // Try translating the UI Toast error message directly using the generic translation functions
      const toastTranslation = this.translateEnglishMessage(msg) || this.translatePortugueseMessage(msg);
      if (toastTranslation) {
        title = toastTranslation.title;
        meaning = toastTranslation.meaning;
        solution = toastTranslation.solution;
        categoryKey = 'META'; // since these translations usually refer to META/Cloud API errors
      }

      if (ctx.connectionStatus || lowerMsg === 'desconectado' || lowerMsg === 'pendente' || lowerMsg === 'inativo' || lowerMsg.includes('websocket desconectado') || lowerMsg.includes('falha de comunicação no websocket')) {
        const connName = ctx.connectionName || 'Desconhecido';
        const connProvider = ctx.connectionProvider || 'WhatsApp';
        const connStatus = ctx.connectionStatus || msg;
        const statusLower = connStatus.toLowerCase();

        if (lowerMsg.includes('websocket desconectado') || lowerMsg.includes('falha de comunicação no websocket')) {
          categoryKey = 'SYSTEM';
          const code = Number(data.errorDetail?.code || 0);
          title = `Conexão de Mensagens Interrompida (WebSocket)`;
          
          let specificMeaning = `A ligação em tempo real do CRM com o servidor de mensagens caiu inesperadamente${code ? ` (Código: ${code})` : ''}. Isso pode impedir que novas mensagens apareçam automaticamente sem dar F5.`;
          let specificSolution = [
            `Verifique se a sua conexão de internet local está estável.`,
            `Atualize a página do CRM com <strong>F5</strong> ou <strong>Ctrl+F5</strong> para restabelecer a linha de comunicação.`,
            `Se as quedas persistirem, pode haver uma instabilidade temporária no servidor do DataCrazy.`
          ];

          if (code === 1006) {
            title = 'Queda Anormal do WebSocket (Código 1006)';
            specificMeaning = 'O navegador perdeu o contato físico com o servidor de mensagens em tempo real (sem enviar um handshake de encerramento). Isso acontece por oscilações na rede Wi-Fi local, queda momentânea de internet ou bloqueio do servidor DNS.';
            specificSolution = [
              'Verifique se a sua conexão física com a internet ou roteador Wi-Fi está estável.',
              'Atualize a página do CRM com F5 ou Ctrl+F5.',
              'Se persistir, experimente trocar o servidor DNS da sua máquina para um público estável (como 8.8.8.8 da Google).'
            ];
          } else if (code === 1011) {
            title = 'Crash Interno no Servidor de WebSocket (Código 1011)';
            specificMeaning = 'O servidor de mensagens em tempo real do DataCrazy encontrou uma condição inesperada que o forçou a fechar a conexão (erro fatal/crash no backend do socket).';
            specificSolution = [
              'Recarregue a página com F5.',
              'Trata-se de um bug interno ou queda temporária de serviço no backend deles. Se o erro continuar acontecendo, avise a equipe de infraestrutura.'
            ];
          } else if (code === 1015) {
            title = 'Falha de TLS/SSL no WebSocket (Código 1015)';
            specificMeaning = 'A conexão segura em tempo real não pôde ser estabelecida porque o certificado SSL/TLS do servidor de mensagens do DataCrazy expirou ou é inválido.';
            specificSolution = [
              'Verifique se a data e hora do seu computador estão corretas e atualizadas.',
              'Este erro indica um problema crítico no certificado SSL do servidor do CRM que exige atenção do suporte técnico do DataCrazy.'
            ];
          }

          meaning = specificMeaning;
          solution = specificSolution;
        } else if (statusLower.includes('desconectado') || statusLower.includes('inativo')) {
          categoryKey = 'UNOFFICIAL';
          const providerLower = connProvider.toLowerCase();
          if (providerLower.includes('meta') || providerLower.includes('oficial') || providerLower.includes('cloud')) {
            categoryKey = 'META';
          }
          gatewayName = connProvider;
          title = `Instância Desconectada: ${connName}`;
          meaning = `A instância de WhatsApp "${connName}" (via gateway ${connProvider}) está desconectada. Nenhuma mensagem automática ou manual poderá ser enviada por ela até que seja reconectada.`;
          solution = [
            `Acesse a tela de <strong>Canais / Conexões</strong> do DataCrazy CRM.`,
            `Localize a conexão com o nome <strong>"${connName}"</strong> e clique em <strong>Gerenciar</strong>.`,
            `Verifique o status do QR Code ou reconecte o aparelho celular para reativar o serviço.`
          ];
        } else if (statusLower.includes('pendente')) {
          categoryKey = 'UNOFFICIAL';
          const providerLower = connProvider.toLowerCase();
          if (providerLower.includes('meta') || providerLower.includes('oficial') || providerLower.includes('cloud')) {
            categoryKey = 'META';
          }
          gatewayName = connProvider;
          title = `Conexão Pendente: ${connName}`;
          meaning = `A instância de WhatsApp "${connName}" (via gateway ${connProvider}) está em estado pendente (aguardando a leitura do QR Code ou inicialização).`;
          solution = [
            `Acesse a tela de <strong>Canais / Conexões</strong> do DataCrazy CRM.`,
            `Clique em <strong>Gerenciar</strong> na conexão <strong>"${connName}"</strong>.`,
            `Escaneie o QR Code exibido na tela usando a opção "Aparelhos conectados" no aplicativo do WhatsApp em seu celular.`
          ];
        }
      }
      // Specific Toast heuristic matching
      else if (lowerMsg.includes('24 horas') || lowerMsg.includes('template') || lowerMsg.includes('passaram')) {
        categoryKey = 'META';
        title = 'Janela de Conversa de 24h Expirada (Meta)';
        meaning = 'O CRM exibiu um aviso na tela indicando que a janela de conversa de 24 horas da Meta expirou. Mensagens comuns não podem ser enviadas.';
        solution = [
          'Utilize um <strong>Template de Mensagem</strong> (Modelo Aprovado) para restabelecer o contato.',
          'Assim que o cliente responder, a janela de 24 horas será reaberta para mensagens livres.',
          'Evite o envio de mensagens normais, mídias ou automações de fluxo antes da resposta do lead.'
        ];
      } else if (lowerMsg.includes('não suportad') || lowerMsg.includes('unsupported')) {
        categoryKey = 'META';
        title = 'Tipo de Mensagem Não Suportada';
        meaning = 'O CRM ou a API Oficial da Meta detectou um tipo de mensagem que não é suportado pelo canal.';
        solution = [
          'Verifique o conteúdo enviado pelo cliente diretamente no celular.',
          'Oriente o cliente a reenviar a informação em formato de texto simples ou imagem padrão.'
        ];
      } else if (lowerMsg.includes('evolution')) {
        categoryKey = 'UNOFFICIAL';
        gatewayName = 'Evolution';
        title = 'Instabilidade com a Evolution API';
        meaning = 'O sistema não conseguiu se conectar com a instância do WhatsApp rodando via Evolution API.';
        solution = [
          'Verifique se o seu servidor do Evolution está online e acessível.',
          'Vá em Canais/Conexões no DataCrazy, localize a conexão da Evolution e confira se a URL e a API Key estão corretas.',
          'Certifique-se de que a instância da Evolution não está desconectada ou travada. Se necessário, reinicie o servidor do Evolution.'
        ];
      } else if (lowerMsg.includes('uazapi')) {
        categoryKey = 'UNOFFICIAL';
        gatewayName = 'Uazapi';
        title = 'Erro de Comunicação com a Uazapi';
        meaning = 'O CRM tentou enviar uma mensagem ou se conectar ao WhatsApp via gateway Uazapi, mas a chamada falhou.';
        solution = [
          'Verifique se a sua conta/assinatura na Uazapi está ativa e regularizada.',
          'Confirme se os campos de Host/Servidor e Token de Instância batem com as credenciais da Uazapi.'
        ];
      } else if (lowerMsg.includes('z-api') || lowerMsg.includes('zapi')) {
        categoryKey = 'UNOFFICIAL';
        gatewayName = 'Z-API';
        title = 'Instância do Z-API Inválida ou Desconectada';
        meaning = 'A conexão com a Z-API falhou. O CRM não conseguiu achar a instância ou autenticar a chave.';
        solution = [
          'Acesse o painel da Z-API e veja se a instância de WhatsApp está conectada ao QR Code.',
          'Confira se a chave de token de segurança e a ID de instância foram copiados corretamente para as configurações do DataCrazy.'
        ];
      } else if (lowerMsg.includes('d-api') || lowerMsg.includes('dapi')) {
        categoryKey = 'UNOFFICIAL';
        gatewayName = 'D-API';
        title = 'Falha de Comunicação com a D-API';
        meaning = 'A conexão com a D-API falhou ou a instância do WhatsApp está inativa/desconectada no gateway.';
        solution = [
          'Acesse o painel do D-API e confira a situação do QR Code da instância.',
          'Verifique se o token de segurança e as configurações de host estão corretas no CRM.'
        ];
      } else if (lowerMsg.includes('restringida') || lowerMsg.includes('desabilitada') || lowerMsg.includes('política da plataforma') || lowerMsg.includes('pin de duas etapas')) {
        categoryKey = 'META';
        title = 'Restrição de Conta / PIN Incorreto (Meta)';
        meaning = 'O WhatsApp Business oficial (Meta) bloqueou o número por violação de políticas comerciais ou a confirmação em duas etapas falhou.';
        solution = [
          'Acesse o painel do Facebook Business Suite e verifique o menu de Qualidade da Conta.',
          'Caso tenha alterado a senha/PIN do número no celular recentemente, atualize a senha de 2FA nas configurações do canal no DataCrazy.'
        ];
      }
    }

    // C. API ERRORS (HTTP Status >= 400 or Inner JSON error arrays)
    else if (type === 'API_HTTP_ERROR' || type === 'API_LOGICAL_ERROR' || type === 'API_NETWORK_ERROR') {
      const errDetail = data.errorDetail || {};
      const errorCode = String(errDetail.errorCode || '');
      const errMsg = String(errDetail.errorMessage || '');
      const url = String(data.url || '');
      const status = data.status || 0;

      // 0. Check for Prisma Database Errors
      if (this.PRISMA_ERRORS[errorCode]) {
        categoryKey = 'DATABASE';
        const pErr = this.PRISMA_ERRORS[errorCode];
        title = pErr.title;
        meaning = pErr.meaning;
        solution = pErr.solution;
        severity = 'danger';
      }
      // 1. Identify channel from URL or error codes
      else if (errorCode === 'lead-with-same-contact-exists' || errMsg.includes('lead with same contacts already exists') || errMsg.includes('lead with same contact already exists')) {
        categoryKey = 'SYSTEM';
        title = 'Lead Duplicado na Automação';
        meaning = 'A automação tentou criar ou atualizar um lead, mas a operação foi recusada porque já existe um lead ativo com o mesmo contato (telefone ou e-mail) no CRM.';
        solution = [
          'Verifique se o lead já está cadastrado no funil antes de rodar a automação.',
          'Ajuste as regras de duplicidade do CRM se desejar permitir contatos repetidos.',
          'Abra a aba <strong>Técnico</strong> neste card para ver os detalhes do contato e o payload JSON.'
        ];
        severity = 'warning';
      }
      else if (errorCode === 'product-does-not-exist' || errorCode === 'product_not_found' || errMsg.includes('produto não existe') || errMsg.includes('Produto não existe') || errMsg.includes('product does not exist')) {
        categoryKey = 'SYSTEM';
        title = 'Produto Não Encontrado na Automação';
        meaning = 'A automação tentou executar uma ação vinculada a um produto (como associar o produto a um lead ou gerar um pedido de venda), mas o produto especificado pelo ID ou nome não pôde ser localizado ou foi excluído do catálogo do CRM.';
        solution = [
          'Verifique se o produto está cadastrado e ativo no menu de <strong>Produtos</strong> do CRM.',
          'Confira se a ID do produto configurada no bloco correspondente do fluxo de automação está correta.',
          'Certifique-se de que o produto não foi desativado ou deletado por outro usuário.'
        ];
        severity = 'warning';
      }
      else if (errorCode === '190' || errMsg.includes('190') || errMsg.includes('changed their password') || errMsg.includes('session has been invalidated')) {
        categoryKey = 'META';
        title = 'Token da Meta Inválido ou Revogado (Código 190)';
        meaning = 'A conexão oficial com a API Cloud da Meta caiu porque a senha da conta do Facebook associada foi alterada, ou o Facebook revogou o token de segurança permanente por motivos internos ou de inatividade.';
        solution = [
          'Acesse as configurações de Canais no DataCrazy CRM.',
          'Gere um novo token de acesso permanente no painel developers.facebook.com e atualize-o no CRM.',
          'Evite alterar senhas de contas administradoras vinculadas ao app do Facebook para não revogar o token existente.'
        ];
        severity = 'danger';
      }
      else if (errorCode === 'contact-was-not-found' || errMsg.includes('contact-was-not-found') || errMsg.includes('contact was not found')) {
        categoryKey = 'SYSTEM';
        title = 'Contato Não Encontrado na Automação';
        meaning = 'A automação tentou executar uma ação (como enviar mensagem ou atualizar status) para um contato que não pôde ser localizado na base do CRM (possivelmente foi deletado ou a ID enviada está corrompida).';
        solution = [
          'Verifique se o contato ainda existe no menu de Contatos do CRM.',
          'Certifique-se de que a ID ou telefone passados no bloco correspondente do fluxo de automação estão corretos e válidos.'
        ];
        severity = 'warning';
      }
      else if (errorCode === 'session_expired_24h' || errMsg.toLowerCase().includes('24 hours') || errMsg.toLowerCase().includes('re-engagement')) {
        categoryKey = 'META';
        title = 'Janela de Conversa de 24h Expirada (Meta)';
        meaning = 'Mais de 24 horas se passaram desde a última mensagem recebida do cliente. Pelas políticas da Meta (WhatsApp) e do Instagram, o envio de mensagens comuns foi bloqueado para este canal.';
        solution = [
          'Envie um <strong>Template de Mensagem</strong> (Modelo Aprovado) para restabelecer o contato com o cliente.',
          'Assim que o cliente responder ao template, a janela de 24 horas será reaberta para mensagens livres.',
          'Evite tentar enviar textos comuns, mídias ou fluxos de automação sem template antes da resposta do lead.'
        ];
        severity = 'warning';
      }
      else if (errorCode === 'unsupported_message_type') {
        categoryKey = 'META';
        title = 'Tipo de Mensagem Não Suportada';
        meaning = 'O cliente enviou um tipo de mensagem que não é suportado pelo WhatsApp Oficial (Meta) ou pelas configurações do CRM (ex: botões interativos antigos, arquivos específicos, enquetes antigas ou mensagens de sistema incompatíveis).';
        solution = [
          'Verifique o conteúdo enviado pelo cliente diretamente no aplicativo do celular, se possível.',
          'Oriente o cliente a enviar a informação em outro formato (ex: como texto simples ou imagem comum).',
          'Certifique-se de que a API do WhatsApp está atualizada para suportar novos formatos de mídia.'
        ];
        severity = 'warning';
      }
      else if (errorCode === 'unknown_message_type') {
        categoryKey = 'META';
        title = 'Tipo de Mensagem Desconhecido';
        meaning = 'O CRM recebeu uma mensagem cujo formato ou tipo não pôde ser identificado. Isso pode acontecer quando o cliente utiliza recursos muito novos do WhatsApp (como novos tipos de enquetes, figurinhas animadas de parceiros ou mídias não homologadas).';
        solution = [
          'Verifique a conversa diretamente no aplicativo do celular para entender o conteúdo da mensagem.',
          'Oriente o cliente a reenviar a informação como texto ou imagem comum se necessário.'
        ];
        severity = 'warning';
      }
      else if (this.translateEnglishMessage(errMsg) || this.translatePortugueseMessage(errMsg)) {
        const engTranslation = this.translateEnglishMessage(errMsg) || this.translatePortugueseMessage(errMsg);
        title = engTranslation.title;
        meaning = engTranslation.meaning;
        solution = engTranslation.solution;
        
        // Resolve gateway/category if possible
        if (url.includes('evolution') || errorCode.includes('evolution') || errMsg.toLowerCase().includes('evolution')) {
          categoryKey = 'UNOFFICIAL';
          gatewayName = 'Evolution';
        } else if (url.includes('uazapi') || errorCode.includes('uazapi')) {
          categoryKey = 'UNOFFICIAL';
          gatewayName = 'Uazapi';
        } else if (url.includes('zapi') || url.includes('z-api') || errorCode.includes('z-api')) {
          categoryKey = 'UNOFFICIAL';
          gatewayName = 'Z-API';
        } else if (url.includes('dapi') || url.includes('d-api') || errorCode.includes('dapi') || errorCode.includes('d-api')) {
          categoryKey = 'UNOFFICIAL';
          gatewayName = 'D-API';
        } else if (url.includes('universal-connection') || errorCode.includes('universal')) {
          categoryKey = 'UNIVERSAL';
        } else {
          categoryKey = 'META';
        }
      }
      else if (url.includes('evolution') || errorCode.includes('evolution') || errMsg.toLowerCase().includes('evolution')) {
        categoryKey = 'UNOFFICIAL';
        gatewayName = 'Evolution';
        title = 'Erro de Integração (Evolution API)';
        meaning = `A Evolution API rejeitou o comando com a mensagem: "${errMsg}"`;
        solution = [
          'Verifique se a URL da instância configurada no canal está ativa e responde a requisições externas.',
          'Verifique se o Token da Evolution não foi resetado nas configurações do servidor.',
          'Tente abrir o Evolution Manager para reiniciar a instância manualmente.'
        ];
      } 
      else if (url.includes('uazapi') || errorCode.includes('uazapi')) {
        categoryKey = 'UNOFFICIAL';
        gatewayName = 'Uazapi';
        title = 'Erro de Endpoint (Uazapi)';
        meaning = `A Uazapi retornou erro de conexão: "${errMsg}"`;
        solution = [
          'Verifique se o seu servidor do Uazapi está de pé.',
          'Certifique-se de que a instância não foi deletada no gerenciador do Uazapi.'
        ];
      }
      else if (url.includes('zapi') || url.includes('z-api') || errorCode.includes('z-api')) {
        categoryKey = 'UNOFFICIAL';
        gatewayName = 'Z-API';
        title = 'Erro de Gateway (Z-API)';
        meaning = `O gateway Z-API reportou falha ao enviar: "${errMsg}"`;
        solution = [
          'Acesse a plataforma da Z-API e certifique-se de que a instância não está bloqueada pelo WhatsApp por excesso de spam.',
          'Garanta que as credenciais inseridas no CRM não foram alteradas.'
        ];
      }
      else if (url.includes('dapi') || url.includes('d-api') || errorCode.includes('dapi') || errorCode.includes('d-api')) {
        categoryKey = 'UNOFFICIAL';
        gatewayName = 'D-API';
        title = 'Erro de Gateway (D-API)';
        meaning = `O gateway D-API retornou erro: "${errMsg}"`;
        solution = [
          'Verifique o status da sua instância e do token no painel da D-API.',
          'Certifique-se de que as credenciais cadastradas estão válidas no CRM.'
        ];
      }
      else if (url.includes('universal-connection') || url.includes('webhook') || errorCode.includes('universal')) {
        categoryKey = 'UNIVERSAL';
        title = 'Erro na Conexão Universal HTTP';
        meaning = `A sua API externa de conexão universal falhou: "${errMsg}"`;
        solution = [
          'Confira se a URL Base configurada na conexão está correta.',
          'Caso utilize variáveis no JSON de envio (ex: ${message.body}), verifique se a sintaxe e as chaves estão corretas.',
          'Se a resposta retornou status 504 ou Timeout, o seu servidor demorou mais de 30 segundos para processar o disparo.'
        ];
      }
      else if (errorCode.includes('whatsapp-cloud-error') || errorCode.includes('meta') || errorCode === 'chat.errors.send-message-error' || errorCode.includes('send-message-error')) {
        categoryKey = 'META';
        title = 'Falha ao Enviar Mensagem (WhatsApp Cloud API)';
        meaning = errMsg || 'O CRM tentou enviar a mensagem via WhatsApp Cloud API, mas a Meta retornou um erro nos parâmetros da solicitação.';
        solution = [
          'Verifique se os parâmetros da mensagem (como as variáveis do template, links ou campos dinâmicos) estão preenchidos de forma correta.',
          'Confira se a conta da Meta não possui nenhuma restrição ou se a janela de 24 horas não foi ultrapassada.',
          'Consulte os detalhes na aba Técnico para ver se a Meta especificou qual campo gerou a rejeição.'
        ];

        // Specific Meta Code extraction (ex: "error-code-131031")
        const codeMatch = errorCode.match(/error-code-(\d+)/) || errMsg.match(/#(\d+)/);
        if (codeMatch && this.META_ERRORS[codeMatch[1]]) {
          const metaErr = this.META_ERRORS[codeMatch[1]];
          title = metaErr.title;
          meaning = metaErr.meaning;
          solution = metaErr.solution;
        }
      }

      // 2. Generic HTTP Error fallback if category wasn't set by URL/code
      if (title === 'Erro Indefinido') {
        if (status === 401) {
          title = 'Sessão Expirada / Não Autorizado';
          meaning = 'O CRM recusou a requisição porque o token de login do seu navegador expirou ou as credenciais de autenticação são inválidas.';
          solution = [
            'Faça logout do CRM DataCrazy e faça o login novamente para revalidar a sessão.',
            'Se estiver usando APIs externas, confira se a chave Bearer Token está correta nas configurações.'
          ];
        } 
        else if (status === 403) {
          title = 'Permissão Negada';
          meaning = 'Você ou a conexão tentaram acessar um recurso do CRM que o seu usuário ou token não tem permissão para visualizar.';
          solution = ['Solicite ao administrador do DataCrazy para verificar os privilégios do seu perfil de usuário (ex: permissões de agente vs gestor).'];
        } 
        else if (status === 429) {
          title = 'Muitas Requisições (Rate Limit)';
          meaning = 'O CRM do DataCrazy bloqueou as solicitações porque o limite de 60 requisições por minuto por rota foi ultrapassado.';
          solution = [
            'Aguarde alguns segundos antes de realizar novas buscas, recarregar a tela ou enviar mensagens.',
            'Se houver um cabeçalho "Retry-After" visível na aba Técnico, espere o tempo indicado lá.'
          ];
        } 
        else if (status === 502 || status === 503) {
          title = 'Servidor do CRM Temporariamente Indisponível (502/503)';
          meaning = `O servidor web do DataCrazy não conseguiu falar com o backend da aplicação ou está em manutenção temporária (HTTP ${status}).`;
          solution = [
            'Aguarde de 1 a 2 minutos e dê F5 na página.',
            'Se a indisponibilidade persistir, o servidor do CRM pode estar passando por uma manutenção programada ou instabilidade física.'
          ];
        }
        else if (status === 504) {
          title = 'Tempo Limite do Servidor Esgotado (Gateway Timeout 504)';
          meaning = `O servidor do CRM demorou mais de 30 segundos para processar a requisição e a conexão foi encerrada pelo Gateway (HTTP 504).`;
          solution = [
            'Aguarde alguns segundos e tente novamente.',
            'Isso indica que o banco de dados ou a API externa de processamento do DataCrazy está sob carga muito pesada.'
          ];
        }
        else if (status >= 500) {
          title = 'Instabilidade no Servidor do DataCrazy (Erro 5xx)';
          meaning = `O servidor interno do DataCrazy falhou ao processar a requisição (HTTP ${status}).`;
          solution = [
            'Aguarde alguns instantes e recarregue a página com Ctrl+F5.',
            'Trata-se de uma instabilidade temporária na infraestrutura deles. Caso continue por muito tempo, contate o suporte do DataCrazy.'
          ];
        } else if (status === 0) {
          categoryKey = 'SYSTEM';
          title = 'Falha de Conexão com o Servidor (CORS / Rede)';
          meaning = `A requisição HTTP falhou (CORS ou falha de resolução DNS). Mensagem: "${errMsg}"`;
          solution = [
            'Verifique sua internet.',
            'O servidor de destino pode estar recusando conexões diretas do navegador devido a políticas de CORS. Certifique-se de que os cabeçalhos Access-Control-Allow-Origin estão corretos no servidor receptor.'
          ];
        } else {
          // Fallback rico para qualquer erro de API sem tradução específica
          if (errMsg || errorCode) {
            title = errorCode ? `Erro de API (${errorCode})` : 'Erro de Resposta da API';
            meaning = `O CRM enviou uma chamada para o servidor, mas a API recusou a operação com a mensagem: "${errMsg || 'Sem detalhe do erro'}" (Status HTTP: ${status || 'N/A'}).`;
            solution = [
              'Confirme se as informações inseridas na tela ou as chaves de integração do canal estão corretas.',
              'Abra a aba <strong>Técnico</strong> neste card para copiar o JSON de erro completo e encaminhar ao suporte N3/N4.'
            ];
          }
        }
      }
    }

    // Determine category metadata
    const catMeta = this.CATEGORIES[categoryKey] || this.CATEGORIES.SYSTEM;

    if (entry.occurrenceCount > 1) {
      title += ` (x${entry.occurrenceCount})`;
    }

    return {
      title: title,
      categoryName: catMeta.name,
      categoryClass: catMeta.class,
      severity: catMeta.severity,
      meaning: meaning,
      solution: solution,
      gatewayName: gatewayName
    };
  },

  loadDynamicRules: function(rules) {
    if (!rules || typeof rules !== 'object') return;
    if (rules.META_ERRORS) {
      this.META_ERRORS = { ...this.META_ERRORS, ...rules.META_ERRORS };
    }
    if (rules.PRISMA_ERRORS) {
      this.PRISMA_ERRORS = { ...this.PRISMA_ERRORS, ...rules.PRISMA_ERRORS };
    }
    if (rules.CATEGORIES) {
      this.CATEGORIES = { ...this.CATEGORIES, ...rules.CATEGORIES };
    }
  }
};
