// ==UserScript==
// @name         Produtos Flow — marcar produtos no YouTube Studio
// @namespace    produtos-flow.cortes
// @version      1.13.3
// @description  Escolhe produtos ligados ao convidado e ao assunto do corte, marca no Studio, distribui os tempos e PARA para conferência humana. Não salva nada sozinho. Sem IA.
// @match        https://studio.youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @connect      www.youtube.com
// @connect      pt.wikipedia.org
// @run-at       document-idle
// @noframes
// @homepageURL  https://github.com/erikbrasil/produtos-flow
// @updateURL    https://raw.githubusercontent.com/erikbrasil/produtos-flow/main/produtos-flow.user.js
// @downloadURL  https://raw.githubusercontent.com/erikbrasil/produtos-flow/main/produtos-flow.user.js
// ==/UserScript==
//
// COMO FUNCIONA (resumo para quem for mexer depois):
// 1. Lê título, descrição e tags do vídeo aberto no Studio.
// 2. Pega o link "ASSISTA COMPLETO" da descrição e descobre o título do episódio inteiro
//    (pela página pública do YouTube, oEmbed) — é assim que acha o convidado quando o
//    nome dele não está no título do corte.
// 3. Procura convidados (lista CONVIDADOS) e assuntos (lista TEMAS) por palavras-chave.
// 4. Faz as buscas na janela "Marcar produtos" e só aceita produto cujo nome tenha as
//    palavras exigidas (campo "exige"). Pula esgotados/indisponíveis.
// 5. PARADA 1: mostra quantos e quais produtos marcou. Você confere, tira ou põe à mão.
// 6. Marca os tempos (a partir de 0:30, espalhados até o fim do vídeo).
// 7. PARADA 2: você confere os tempos e clica em "Pronto" (e "Salvar", em vídeo publicado).
//    O script NUNCA clica em Pronto, Salvar ou Publicar.

(function () {
  'use strict';
  const VERSAO = '1.13.3';

  // ====================================================================================
  //  LISTAS — para acrescentar convidado ou tema, copie um bloco e troque os textos.
  //  Palavras sem acento e em minúsculas. Um * no fim quer dizer "começa com"
  //  (ex.: "geopolitic*" pega geopolítica, geopolítico, geopolíticos...).
  // ====================================================================================

  // Apresentadores do Flow: aparecem em quase todo corte, então NÃO contam como convidado.
  const APRESENTADORES = ['igor', 'igor 3k', 'monark', 'flow', 'flow podcast'];

  // Pessoas famosas que aparecem no TÍTULO DO CORTE (não são convidados): viram livros/itens sobre elas.
  const CITADOS = [
    { nome: 'Alexandre de Moraes', apelidos: ['alexandre de moraes', 'moraes', 'xandao'], buscas: ['Alexandre de Moraes livro', 'Alexandre de Moraes Direito Constitucional'], exige: ['moraes'] },
    { nome: 'Gilmar Mendes', apelidos: ['gilmar mendes', 'gilmar'], buscas: ['Gilmar Mendes livro'], exige: ['gilmar mendes'] },
    { nome: 'Luís Roberto Barroso', apelidos: ['luis roberto barroso', 'barroso'], buscas: ['Luís Roberto Barroso livro'], exige: ['barroso'] },
    { nome: 'Flávio Dino', apelidos: ['flavio dino'], buscas: ['Flávio Dino livro'], exige: ['flavio dino'] },
    { nome: 'Bolsonaro', apelidos: ['bolsonaro', 'jair bolsonaro'], buscas: ['Bolsonaro livro'], exige: ['bolsonaro'] },
    { nome: 'Lula', apelidos: ['lula'], buscas: ['Lula livro biografia'], exige: ['lula'] },
    { nome: 'Donald Trump', apelidos: ['donald trump', 'trump'], buscas: ['Donald Trump livro'], exige: ['trump'] },
    { nome: 'Elon Musk', apelidos: ['elon musk', 'musk'], buscas: ['Elon Musk biografia livro'], exige: ['musk'] },
    { nome: 'Vladimir Putin', apelidos: ['vladimir putin', 'putin'], buscas: ['Putin livro'], exige: ['putin'] },
    { nome: 'Olavo de Carvalho', apelidos: ['olavo de carvalho', 'olavo'], buscas: ['Olavo de Carvalho livro'], exige: ['olavo'] },
    { nome: 'Javier Milei', apelidos: ['javier milei', 'milei'], buscas: ['Milei livro'], exige: ['milei'] },
    { nome: 'Xi Jinping', apelidos: ['xi jinping', 'jinping'], buscas: ['Xi Jinping livro'], exige: ['jinping'] },
    { nome: 'Napoleão', apelidos: ['napoleao'], buscas: ['Napoleão livro'], exige: ['napoleao'] },
    { nome: 'Steve Jobs', apelidos: ['steve jobs'], buscas: ['Steve Jobs biografia'], exige: ['steve jobs'] },
    { nome: 'Ayrton Senna', apelidos: ['ayrton senna', 'senna'], buscas: ['Ayrton Senna livro', 'Ayrton Senna miniatura'], exige: ['senna'] },
    { nome: 'Neymar', apelidos: ['neymar'], buscas: ['Neymar livro', 'Neymar camisa'], exige: ['neymar'] },
  ];

  // nome: como aparece no painel | apelidos: como pode vir no título/descrição
  // buscas: o que digitar na busca de produtos | exige: o nome do produto precisa ter
  // pelo menos UMA destas palavras | temas: assuntos ligados (ajudam a completar)
  const CONVIDADOS = [
    { nome: 'Edu Falaschi', apelidos: ['edu falaschi', 'falaschi'], buscas: ['Edu Falaschi', 'Edu Falaschi CD', 'Edu Falaschi vinil', 'Angra CD', 'Angra vinil', 'Angra camiseta'], exige: ['edu falaschi', 'falaschi', 'angra'], temas: ['musica'] },
    { nome: 'Professor HOC', apelidos: ['professor hoc', 'prof hoc', 'hoc'], buscas: ['Professor HOC livro', 'Professor HOC'], exige: ['hoc'], temas: ['geopolitica', 'historia'] },
    { nome: 'Dilera', apelidos: ['dilera'], buscas: ['Dilera'], exige: ['dilera'], temas: ['saude-mental', 'comedia'] },
    { nome: 'Samuca', apelidos: ['samuca'], buscas: ['Samuca'], exige: ['samuca'], temas: ['saude-mental', 'comedia'] },
    { nome: 'Fiuk', apelidos: ['fiuk'], buscas: ['Fiuk', 'Fiuk CD'], exige: ['fiuk'], temas: ['carros', 'japao'] },
    { nome: 'Renan Santos', apelidos: ['renan santos', 'renan'], buscas: ['Renan Santos livro', 'Renan Santos'], exige: ['renan santos'], temas: ['politica'] },
    { nome: 'Felipe Moura Brasil', apelidos: ['felipe moura brasil', 'moura brasil'], buscas: ['Felipe Moura Brasil livro', 'Felipe Moura Brasil'], exige: ['moura brasil'], temas: ['politica'] },
    { nome: 'Pablo Marçal', apelidos: ['pablo marcal', 'marcal'], buscas: ['Pablo Marçal livro', 'Pablo Marçal'], exige: ['pablo marcal', 'marcal'], temas: ['empreendedorismo', 'politica'] },
  ];

  // chaves: palavras que indicam o assunto | buscas: [texto da busca, palavras exigidas]
  // "exige" é uma lista de grupos: o nome do produto precisa ter UMA palavra de CADA grupo.
  // "recusa": se o nome tiver uma destas palavras, o produto é descartado.
  const TEMAS = {
    'justica': {
      nome: 'STF / Justiça',
      chaves: ['stf', 'supremo', 'moraes', 'xandao', 'gilmar', 'toffoli', 'barroso', 'fachin', 'zanin', 'flavio dino', 'juiz*', 'juiza*', 'tribunal*', 'justica', 'constituic*', 'inquerito*', 'censura', 'julgamento*', 'condenad*', 'magistrad*', 'pgr', 'tse', 'stj'],
      buscas: [
        ['Alexandre de Moraes livro', [['moraes']]],
        ['Livro STF Supremo Tribunal Federal', [['livro', 'box'], ['stf', 'supremo']]],
        ['Constituição Federal', [['constituicao']]],
        ['Livro Direito Constitucional', [['livro', 'manual', 'curso'], ['constitucional']]],
        ['Vade Mecum', [['vade mecum']]],
        ['Livro liberdade de expressão', [['livro'], ['liberdade', 'expressao', 'censura']]],
      ],
    },
    'politica': {
      nome: 'Política',
      chaves: ['eleicao*', 'eleitor*', 'eleitora*', 'campanha*', 'voto*', 'votar', 'candidat*', 'bolsonar*', 'lula', 'congresso', 'deputad*', 'senador*', 'senado', 'prefeit*', 'governador*', 'presidente', 'direita', 'esquerda', 'polariza*', 'narrativa*', 'fundao', 'partido*', 'mbl', 'politic*', 'ministro*', 'impeachment', '6x1', '6 por 1', '6 por1', 'escala 6', 'prorrogacao', 'vereador*', 'ativista*'],
      buscas: [
        ['Livro política brasileira', [['livro'], ['politic*', 'eleic*', 'democracia', 'brasil']]],
        ['Constituição Federal', [['constituicao']]],
        ['Livro O Príncipe Maquiavel', [['maquiavel', 'principe']]],
        ['Livro ciência política', [['livro'], ['politic*']]],
        ['Livro democracia', [['livro'], ['democracia', 'democrac*']]],
      ],
    },
    'geopolitica': {
      nome: 'Geopolítica',
      chaves: ['geopolitic*', 'guerra*', 'europa', 'europeu*', 'europeia*', 'china', 'chines*', 'russia', 'russo*', 'eua', 'estados unidos', 'otan', 'nato', 'israel', 'ira', 'ucrania', 'imigra*', 'imigrante*', 'oriente medio', 'crise mundial', 'continente', 'trump', 'putin', 'palestina', 'gaza', 'venezuela', 'militar*', 'marinha', 'exercito', 'forcas armadas', 'defesa', 'nuclear', 'missil*', 'misseis'],
      buscas: [
        ['Livro geopolítica', [['livro', 'box'], ['geopolitic*']]],
        ['Atlas geográfico', [['atlas']]],
        ['Livro guerra fria', [['livro'], ['guerra*']]],
        ['Livro história da Europa', [['livro'], ['europa', 'europeu*', 'europeia*']]],
        ['Livro China', [['livro'], ['china', 'chines*']]],
        ['Globo terrestre', [['globo']], ['tv', 'televisao']],
      ],
    },
    'historia': {
      nome: 'História',
      chaves: ['historia', 'historiador*', 'historic*', 'imperio*', 'idade media', 'roma', 'romano*', 'nazis*', 'segunda guerra', 'primeira guerra', 'revolucao', 'civiliza*', 'medieval'],
      buscas: [
        ['Livro história do Brasil', [['livro'], ['historia']]],
        ['Livro segunda guerra mundial', [['livro'], ['guerra']]],
        ['Livro Roma antiga', [['livro'], ['roma', 'romano*', 'imperio']]],
        ['Box livros história', [['livro*', 'box'], ['historia']]],
      ],
    },
    'economia': {
      nome: 'Economia',
      chaves: ['economi*', 'inflacao', 'juros', 'bolsa', 'investi*', 'dinheiro', 'dolar', 'imposto*', 'selic', 'banco central', 'mercado financeiro', 'salario*', 'financ*', 'cripto*', 'bitcoin', 'recessao', 'pib'],
      buscas: [
        ['Livro economia', [['livro'], ['economi*']]],
        ['Livro educação financeira', [['livro'], ['financ*', 'dinheiro', 'investi*', 'rico*', 'riqueza']]],
        ['Pai Rico Pai Pobre', [['pai rico']]],
        ['Livro investimentos', [['livro'], ['investi*', 'bolsa', 'acoes']]],
        ['Calculadora financeira HP 12c', [['calculadora']]],
      ],
    },
    'saude-mental': {
      nome: 'Saúde mental / Tourette',
      chaves: ['tourette', 'tique*', 'caps', 'transtorno*', 'ansiedade', 'depressao', 'tdah', 'autis*', 'pcd', 'psiquiatr*', 'psicolog*', 'terapia', 'saude mental', 'bipolar', 'neurodiver*'],
      buscas: [
        ['Livro síndrome de Tourette', [['livro'], ['tourette']]],
        ['Livro saúde mental', [['livro'], ['mental', 'ansiedade', 'mente', 'emoc*', 'psic*']]],
        ['Livro TDAH', [['livro'], ['tdah', 'deficit']]],
        ['Livro autismo', [['livro'], ['autis*']]],
        ['Fidget toy', [['fidget', 'anti estresse', 'antiestresse']]],
      ],
    },
    'comportamento': {
      nome: 'Comportamento / Autoajuda',
      chaves: ['vicio*', 'viciad*', 'dopamina', 'felicidade', 'feliz', 'infeliz', 'habito*', 'disciplina', 'motivacao', 'produtividade', 'proposito', 'autoestima', 'relacionamento*', 'namoro', 'casamento', 'solidao', 'celular', 'redes sociais', 'pornografia', 'procrastina*', 'mentalidade', 'comportamento*', 'cerebro'],
      buscas: [
        ['Livro Nação Dopamina', [['dopamina']]],
        ['Hábitos Atômicos', [['habitos atomicos']]],
        ['O Poder do Hábito', [['poder do habito']]],
        ['Livro felicidade', [['livro'], ['felicidade', 'feliz']]],
        ['Livro disciplina', [['livro'], ['disciplina', 'autodisciplina']]],
        ['Livro inteligência emocional', [['inteligencia emocional']]],
      ],
    },
    'comedia': {
      nome: 'Comédia',
      chaves: ['comedia', 'humor*', 'humorista*', 'stand up', 'standup', 'piada*', 'comediante*'],
      buscas: [
        ['Livro de piadas', [['livro'], ['piada*', 'humor', 'comedia', 'riso', 'rir']]],
        ['Livro stand up comedy', [['livro'], ['stand up', 'comedia', 'humor']]],
      ],
    },
    'carros': {
      nome: 'Carros / Drift',
      chaves: ['carro*', 'drift*', 'jdm', 'motor*', 'turbo', 'tuning', 'corrida*', 'pista', 'piloto*', 'f1', 'formula 1', 'automobil*', 'drifter*', 'racha', 'transito', 'kart', 'nissan', 'toyota', 'honda', 'supra', 'skyline'],
      buscas: [
        ['Hot Wheels JDM', [['hot wheels'], ['jdm', 'nissan', 'toyota', 'honda', 'mazda', 'subaru', 'mitsubishi', 'skyline', 'supra', 'japan*']]],
        ['Hot Wheels Nissan Skyline', [['hot wheels', 'miniatura'], ['skyline', 'nissan', 'gtr', 'gt r']]],
        ['Miniatura Toyota Supra', [['miniatura', 'hot wheels', 'escala'], ['supra', 'toyota']]],
        ['Miniatura carro escala 1/24', [['miniatura'], ['carro*', 'escala']]],
        ['Lego Speed Champions', [['lego'], ['speed', 'carro*']]],
        ['Volante gamer', [['volante'], ['gamer', 'ps5', 'pc', 'xbox', 'logitech', 'thrustmaster']]],
      ],
    },
    'japao': {
      nome: 'Japão',
      chaves: ['japao', 'japones*', 'japonesa*', 'tokyo', 'tokio', 'toquio', 'anime*', 'samurai*'],
      buscas: [
        ['Livro Japão', [['livro'], ['japao', 'japones*', 'japonesa*']]],
        ['Kit hashi', [['hashi']]],
        ['Faca japonesa', [['faca'], ['japones*', 'japonesa*']]],
      ],
    },
    'games': {
      nome: 'Games',
      chaves: ['game*', 'gamer*', 'videogame*', 'playstation', 'ps5', 'xbox', 'nintendo', 'gta', 'minecraft', 'fortnite', 'valorant', 'steam', 'esports'],
      buscas: [
        ['Playstation 5', [['ps5', 'playstation 5', 'play station 5']], ['capa', 'skin', 'adesivo', 'pelicula', 'case']],
        ['Controle DualSense', [['dualsense']], ['capa', 'skin', 'adesivo', 'case']],
        ['Headset gamer', [['headset', 'fone'], ['gamer']]],
        ['Mouse gamer', [['mouse'], ['gamer']], ['mousepad', 'mouse pad']],
        ['Teclado mecânico', [['teclado'], ['mecanico', 'gamer']]],
      ],
    },
    'musica': {
      nome: 'Música',
      chaves: ['musica*', 'musico*', 'banda*', 'rock', 'metal', 'heavy metal', 'guitarra*', 'guitarrista*', 'violao', 'cantor*', 'cantora*', 'disco*', 'album', 'turne', 'angra', 'vocalista', 'show', 'compositor*', 'baterista*', 'baixista*'],
      buscas: [
        ['Corda guitarra', [['corda*', 'encordoamento'], ['guitarra']]],
        ['Corda violão', [['corda*', 'encordoamento'], ['violao']]],
        ['Palheta guitarra', [['palheta*']]],
        ['Disco de vinil', [['vinil', 'lp']], ['adesivo', 'papel de parede']],
        ['Fone de ouvido estúdio', [['fone', 'headphone'], ['estudio', 'monitor*', 'retorno', 'profissional']]],
        ['Afinador', [['afinador']]],
      ],
    },
    'futebol': {
      nome: 'Futebol',
      chaves: ['futebol', 'gol', 'gols', 'copa do mundo', 'selecao', 'campeonato', 'brasileirao', 'flamengo', 'corinthians', 'palmeiras', 'vasco', 'jogador*', 'futebolista*', 'neymar'],
      buscas: [
        ['Camisa Seleção Brasileira 2026', [['camisa', 'camiseta'], ['selecao', 'brasil', 'cbf']], ['feminina', 'feminino', 'baby look', 'babylook', 'infantil']],
        ['Bola de futebol', [['bola'], ['futebol', 'campo', 'society', 'futsal']]],
        ['Chuteira', [['chuteira']]],
        ['Álbum Copa do Mundo 2026', [['album', 'figurinha*'], ['copa']]],
      ],
    },
    'religiao': {
      nome: 'Religião',
      chaves: ['deus', 'igreja*', 'biblia', 'pastor*', 'padre*', 'religi*', 'jesus', 'evangelic*', 'catolic*', 'espirit*'],
      buscas: [
        ['Bíblia', [['biblia']]],
        ['Livro cristão', [['livro'], ['cristao', 'crista', 'deus', 'jesus', 'biblia', 'evangel*', 'fe']]],
        ['Terço', [['terco']]],
      ],
    },
    'ciencia': {
      nome: 'Ciência / Espaço',
      chaves: ['universo', 'espaco sideral', 'nasa', 'fisica', 'astronom*', 'ciencia*', 'cientista*', 'ufo', 'ovni*', 'alien*', 'extraterrestre*', 'buraco negro', 'quantica', 'planeta*'],
      buscas: [
        ['Telescópio', [['telescopio']]],
        ['Livro astronomia', [['livro'], ['astronom*', 'universo', 'cosmos', 'espaco']]],
        ['Cosmos Carl Sagan', [['sagan', 'cosmos']]],
        ['Luminária lua 3D', [['lua'], ['luminaria', 'abajur']]],
      ],
    },
    'crime': {
      nome: 'Crime / Investigação',
      chaves: ['crime*', 'criminos*', 'policia*', 'policial*', 'investiga*', 'serial killer', 'assassin*', 'preso*', 'prisao', 'presidio*', 'faccao', 'trafic*'],
      buscas: [
        ['Livro true crime', [['livro'], ['crime*', 'criminal', 'assassin*', 'serial', 'investiga*']]],
        ['Livro investigação criminal', [['livro'], ['investiga*', 'criminal', 'pericia', 'detetive']]],
      ],
    },
    'fitness': {
      nome: 'Treino / Academia',
      chaves: ['academia', 'treino*', 'musculacao', 'dieta*', 'suplement*', 'whey', 'creatina', 'fisiculturis*', 'hipertrofia', 'maromba'],
      buscas: [
        ['Creatina', [['creatina']]],
        ['Whey protein', [['whey']]],
        ['Coqueteleira', [['coqueteleira']]],
      ],
    },
    'tecnologia': {
      nome: 'Tecnologia',
      chaves: ['inteligencia artificial', 'ia', 'tecnologia*', 'celular*', 'iphone', 'computador*', 'programacao', 'chatgpt', 'robo*', 'algoritmo*', 'internet', 'redes sociais', 'rede social'],
      buscas: [
        ['Livro inteligência artificial', [['livro'], ['inteligencia artificial', 'ia', 'algoritmo*', 'tecnologia']]],
        ['Fone bluetooth', [['fone'], ['bluetooth', 'sem fio']]],
        ['Carregador portátil', [['carregador portatil', 'power bank', 'powerbank']]],
        ['Smartwatch', [['smartwatch', 'relogio inteligente']]],
      ],
    },
    'empreendedorismo': {
      nome: 'Empreendedorismo',
      chaves: ['empreend*', 'empresa*', 'empresario*', 'investidor*', 'negocio*', 'vendas', 'marketing', 'startup*', 'lideranca', 'ceo', 'milionario*', 'bilionario*'],
      buscas: [
        ['Livro empreendedorismo', [['livro'], ['empreend*', 'negocio*', 'empresa*', 'lideranca', 'vendas', 'sucesso']]],
        ['Livro vendas', [['livro'], ['vendas', 'vender', 'negocia*']]],
        ['Hábitos Atômicos', [['habitos atomicos']]],
        ['Livro mindset', [['mindset']]],
      ],
    },
    'comida': {
      nome: 'Comida',
      chaves: ['comida*', 'receita*', 'cozinha*', 'culinari*', 'chef', 'churrasco*', 'restaurante*', 'gastronom*'],
      buscas: [
        ['Kit churrasco', [['churrasco']]],
        ['Livro de receitas', [['livro'], ['receita*', 'culinaria', 'cozinha']]],
        ['Faca de chef', [['faca'], ['chef', 'cozinha']]],
      ],
    },
  };

  // ITENS CORINGA: completam a quantidade quando não acha produto do convidado/assunto.
  // Dá para trocar pelo painel ("Itens coringa"), uma busca por linha. O produto precisa
  // ter todas as palavras principais da busca.
  const CORINGAS_PADRAO = ['Hábitos Atômicos', 'A Psicologia Financeira', 'Mais Esperto que o Diabo', 'Microfone podcast', 'Fone de ouvido bluetooth', 'Kindle'];

  // ASSUNTOS DA FALA: o que a legenda do corte repete vira busca, cada uma com o momento em que é falado.
  // chaves = palavras que contam na fala (com * = começa com); buscas = [texto, palavras exigidas no produto].
  // Só entra o que for falado pelo menos 2 vezes; o mais falado vem primeiro.
  const MAPA_FALA = [
    { chaves: ['impost*', 'tribut*', 'carga tributaria', 'receita federal', 'sonega*'], buscas: [['Livro sistema tributário brasileiro', [['livro'], ['tribut*', 'imposto*']]], ['Livro planejamento tributário', [['livro'], ['tribut*']]]] },
    { chaves: ['divida*', 'endivid*', 'calote*', 'credito', 'juros', 'emprestimo*'], buscas: [['Livro como sair das dívidas', [['livro'], ['divida*', 'endivid*', 'financ*']]], ['Livro finanças pessoais', [['livro'], ['financ*']]]] },
    { chaves: ['empresari*', 'microempres*', 'pequena* empresa*', 'pme', 'empreend*', 'padaria*', 'comercio', 'dono de'], buscas: [['Livro gestão de pequenas empresas', [['livro'], ['empresa*', 'gestao', 'negocio*']]], ['Livro empreendedorismo', [['livro'], ['empreend*', 'negocio*', 'empresa*']]]] },
    { chaves: ['fluxo de caixa', 'caixa da empresa', 'contabil*', 'contador*', 'balanco'], buscas: [['Livro fluxo de caixa', [['livro'], ['caixa', 'financ*', 'contab*']]]] },
    { chaves: ['mercado de capita*', 'equity', 'acoes', 'bolsa de valores', 'investiment*', 'investidor*', 'socio*'], buscas: [['Livro mercado de capitais', [['livro'], ['capitais', 'investiment*', 'acoes', 'bolsa']]], ['O Investidor Inteligente', [['investidor inteligente']]]] },
    { chaves: ['recuperacao judicial', 'falencia', 'falir', 'quebrando', 'quebrou', 'faliu'], buscas: [['Livro recuperação judicial e falência', [['livro', 'manual', 'curso'], ['recuperacao', 'falencia']]]] },
    { chaves: ['projeto* de lei', 'legisla*', 'deputad*', 'senado', 'senador*', 'camara dos deputados', 'congresso', 'votacao'], buscas: [['Livro processo legislativo', [['livro'], ['legislativ*', 'congresso', 'parlament*']]], ['Livro como funciona o Congresso', [['livro'], ['congresso', 'parlament*', 'legislativ*']]]] },
    { chaves: ['6x1', '6 por 1', '6 por1', 'seis por um', 'escala*', 'jornada*', 'clt', 'carteira assinada', 'trabalhador*', 'funcionario*', 'salario*'], buscas: [['CLT Consolidação das Leis do Trabalho', [['clt', 'consolidacao das leis do trabalho']]], ['Livro direito do trabalho', [['livro', 'manual', 'curso'], ['trabalh*']]]] },
    { chaves: ['luta de classes', 'marx*', 'comunis*', 'socialis*', 'proletari*', 'burgues*', 'mais-valia', 'mais valia'], buscas: [['O Capital Karl Marx', [['capital'], ['marx']]], ['Manifesto Comunista', [['manifesto'], ['comunista']]]] },
    { chaves: ['liberal*', 'libertari*', 'livre mercado', 'capitalis*', 'mises', 'hayek', 'privatiza*'], buscas: [['As Seis Lições Mises', [['seis licoes', 'mises']]], ['O Caminho da Servidão', [['caminho da servidao']]]] },
    { chaves: ['estado brasileiro', 'burocra*', 'funcionalismo', 'concursad*', 'estatal', 'estatais', 'servidor* publico*'], buscas: [['Os Donos do Poder Raymundo Faoro', [['donos do poder']]], ['Livro burocracia no Brasil', [['livro'], ['burocra*', 'estado']]]] },
    { chaves: ['corrup*', 'licitac*', 'propina*', 'desvio*', 'lava jato', 'mensalao'], buscas: [['Livro corrupção no Brasil', [['livro'], ['corrup*', 'lava jato', 'propina']]]] },
    { chaves: ['regular a internet', 'regulacao', 'regulamenta*', 'censura*', 'liberdade de expressao', 'fake news', 'pl 2630'], buscas: [['Livro liberdade de expressão', [['livro'], ['liberdade', 'expressao', 'censura']]]] },
    { chaves: ['transito', 'mobilidade', 'transporte publico', 'onibus', 'metro', 'cidade* brasileira*', 'urbanism*'], buscas: [['Livro mobilidade urbana', [['livro'], ['mobilidade', 'urban*', 'cidade*', 'transito']]]] },
    { chaves: ['populis*', 'demagog*', 'totalitar*', 'propaganda politica'], buscas: [['Livro A Revolução dos Bichos', [['revolucao dos bichos']]], ['Livro 1984 George Orwell', [['1984'], ['orwell']]]] },
    { chaves: ['democracia', 'ditadura', 'autoritar*', 'golpe*', 'eleic*'], buscas: [['Como as Democracias Morrem', [['democracias morrem']]]] },
    { chaves: ['inflacao', 'banco central', 'taxa selic', 'selic', 'pib', 'recessao', 'economia brasileira'], buscas: [['Livro economia brasileira', [['livro'], ['economia', 'economic*']]], ['Economia Numa Única Lição', [['unica licao']]]] },
    { chaves: ['bitcoin', 'cripto*', 'blockchain'], buscas: [['Livro bitcoin', [['bitcoin', 'cripto*']]]] },
    { chaves: ['china', 'chines*', 'xi jinping'], buscas: [['Livro China', [['livro'], ['china', 'chines*']]]] },
    { chaves: ['russia', 'putin', 'ucrania'], buscas: [['Livro Rússia Putin', [['livro'], ['russia', 'putin']]]] },
    { chaves: ['judeu*', 'judia*', 'judaismo', 'judaic*', 'sionis*', 'holocausto', 'antissemit*', 'antisemit*'], buscas: [['Livro história do povo judeu', [['livro'], ['judeu*', 'judaismo', 'judaic*', 'judia*']]], ['Livro sionismo', [['livro'], ['sionis*']]], ['O Diário de Anne Frank', [['anne frank']]]] },
    { chaves: ['israel', 'palestin*', 'gaza', 'hamas', 'oriente medio'], buscas: [['Livro Oriente Médio', [['livro'], ['oriente medio', 'israel', 'palestin*']]], ['Livro Palestina', [['livro'], ['palestin*', 'gaza']]]] },
    { chaves: ['estados unidos', 'eua', 'trump', 'americano*'], buscas: [['Livro Estados Unidos história', [['livro'], ['estados unidos', 'america*']]]] },
    { chaves: ['escola*', 'educacao', 'professor*', 'ensino', 'universidade*', 'faculdade*'], buscas: [['Livro educação no Brasil', [['livro'], ['educac*', 'ensino', 'escola']]]] },
    { chaves: ['ansiedade', 'depressao', 'terapia', 'psicolog*', 'saude mental', 'burnout'], buscas: [['Livro ansiedade', [['livro'], ['ansiedade', 'mente', 'emoc*']]]] },
    { chaves: ['filosof*', 'nietzsche', 'platao', 'aristoteles', 'socrates', 'estoic*', 'seneca'], buscas: [['Livro filosofia', [['livro'], ['filosof*', 'estoic*']]], ['Meditações Marco Aurélio', [['meditacoes'], ['marco aurelio']]]] },
    { chaves: ['biblia', 'deus', 'igreja*', 'jesus', 'fe crista'], buscas: [['Bíblia Sagrada', [['biblia']]]] },
    { chaves: ['celular*', 'redes sociais', 'rede social', 'tiktok', 'instagram', 'vicio em tela', 'dopamina'], buscas: [['Livro Nação Dopamina', [['dopamina']]], ['Livro vício em redes sociais', [['livro'], ['redes sociais', 'digital', 'celular']]]] },
    { chaves: ['inteligencia artificial', 'chatgpt', 'robo*', 'automacao'], buscas: [['Livro inteligência artificial', [['livro'], ['inteligencia artificial', 'ia']]]] },
    { chaves: ['games', 'videogame*', 'playstation', 'xbox', 'nintendo', 'jogar'], buscas: [['Controle PS5 DualSense', [['dualsense', 'controle']]], ['Headset gamer', [['headset']]]] },
    { chaves: ['academia', 'treino*', 'musculacao', 'dieta*', 'whey', 'creatina'], buscas: [['Creatina', [['creatina']]], ['Whey protein', [['whey']]]] },
    { chaves: ['guerra mundial', 'nazis*', 'hitler', 'segunda guerra'], buscas: [['Livro Segunda Guerra Mundial', [['livro'], ['segunda guerra', 'guerra mundial']]]] },
    { chaves: ['crime*', 'faccao', 'faccoes', 'pcc', 'comando vermelho', 'trafic*', 'seguranca publica'], buscas: [['Livro crime organizado', [['livro'], ['crime', 'faccao', 'pcc', 'trafico']]]] },
  ];
  // Trecho de propaganda no fim do corte ("acessa esse QR code", "cupom") não conta como assunto.
  function semPropaganda(segs) {
    if (!segs || !segs.length) return segs || [];
    const fim = segs[segs.length - 1].ini || 0;
    const corte = segs.findIndex(sg => sg.ini >= fim * 0.8 && /\b(qr ?code|cupom|link na descri|patrocin|parceir[oa] do (canal|flow)|acesse|acessa esse)\b/i.test(sg.texto));
    return corte > 0 ? segs.slice(0, Math.max(1, corte - 1)) : segs;
  }
  const FRASE_VAZIAS = new Set(('pela pelo pelas pelos modo geral area dela dele deles delas toda todo vez vezes jeito forma fala falar ' +
    'sobre assim aqui isso essa esse cara caras irmao velho mano galera tipo onde quando porque entao mesmo mesma deus ceu').split(' '));
  // Expressões repetidas na fala ("mercado de capitais", "recuperação judicial"), sem dicionário.
  function expressoesDaFala(texto) {
    const ws = norm(texto).split(' ');
    const cont = new Map();
    const forte = w => w && w.length >= 4 && !/\d/.test(w) && !VAZIAS.has(w) && !FALA_VAZIAS.has(w) && !FRASE_VAZIAS.has(w);
    const liga = w => /^(de|da|do|dos|das)$/.test(w);
    const soma = k => cont.set(k, (cont.get(k) || 0) + 1);
    for (let i = 0; i < ws.length - 1; i++) {
      if (!forte(ws[i])) continue;
      // "a b", "a de b", "a de b de c" ("criação do estado de israel")
      let j = i + 1, partes = [ws[i]];
      for (let n = 0; n < 2 && j < ws.length; n++) {
        if (forte(ws[j])) { partes = [...partes, ws[j]]; j += 1; }
        else if (liga(ws[j]) && forte(ws[j + 1])) { partes = [...partes, ws[j], ws[j + 1]]; j += 2; }
        else break;
        soma(partes.join(' '));
      }
    }
    let lista = [...cont].filter(([, n]) => n >= 2).map(([k, n]) => ({ frase: k, n }));
    // expressão curta dentro de uma maior que aparece quase o mesmo tanto: fica só a maior
    lista = lista.filter(x => !lista.some(y => y !== x && y.frase.length > x.frase.length && (' ' + y.frase + ' ').includes(' ' + x.frase + ' ') && y.n >= x.n * 0.6));
    return lista.sort((x, y) => (y.n * y.frase.split(' ').length) - (x.n * x.frase.split(' ').length));
  }
  function assuntosDaFala(segs) {
    const limpos = semPropaganda(segs);
    if (!limpos.length) return [];
    const texto = limpos.map(x => x.texto).join(' ');
    const out = [];
    for (const e of MAPA_FALA) {
      const n = frequencia(texto, e.chaves);
      if (n >= 2) out.push({ n, buscas: e.buscas, chaves: e.chaves, tempo: momentoNaFala(limpos, e.chaves) });
    }
    out.sort((a, b) => b.n - a.n);
    const cobertas = out.flatMap(o => o.chaves);
    // expressões que nenhum item do dicionário cobre viram "livro <expressão>"
    // expressões repetidas viram "livro <expressão>" (menos as que são só uma palavra-chave do dicionário)
    const extras = expressoesDaFala(texto).filter(x => !cobertas.some(c => norm(c.replace(/\*/g, '')) === x.frase)).slice(0, 3).map(x => {
      const fortes = palavrasFortes(x.frase);
      return { n: x.n, chaves: [x.frase], tempo: momentoNaFala(limpos, [x.frase]), buscas: [['livro ' + x.frase, [['livro'], ...fortes.map(w => [w.length > 4 ? w.slice(0, w.length - 1) + '*' : w])]]] };
    });
    const fortes = extras.filter(x => x.n >= 3), fracos = extras.filter(x => x.n < 3);
    return [...fortes, ...out.slice(0, 8), ...fracos];
  }

  // ====================================================================================
  //  LÓGICA (sem IA: só comparação de palavras)
  // ====================================================================================

  const norm = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

  // termo com * no fim = "palavra que começa com"
  function tem(texto, termo) {
    const t = ' ' + norm(texto) + ' ';
    const prefixo = termo.endsWith('*');
    const p = norm(prefixo ? termo.slice(0, -1) : termo);
    if (!p) return false;
    if (!prefixo) return t.includes(' ' + p + ' ');
    return t.includes(' ' + p);
  }
  const temAlgum = (texto, termos) => termos.some(x => tem(texto, x));
  const contar = (texto, termos) => termos.reduce((n, x) => n + (tem(texto, x) ? 1 : 0), 0);

  // Tira da descrição as linhas fixas do canal ("VIRE MEMBRO", links etc.)
  function limparDescricao(desc) {
    return String(desc || '').split(/\r?\n/)
      .filter(l => !/vire membro|assista completo|https?:\/\/|~{3,}|@flowpodcast/i.test(l))
      .join('\n');
  }

  function linkEpisodio(desc) {
    const texto = String(desc || '');
    const depois = texto.split(/assista completo/i)[1] || '';
    const achar = s => {
      const m = s.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/(?:live\/|watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
      return m ? m[1] : null;
    };
    return achar(depois) || achar(texto.replace(/youtube\.com\/@[^\s]+/g, ''));
  }

  // Títulos reais do episódio inteiro no canal do Flow:
  //   "PROFESSOR HOC - Flow #669"
  //   "DRIFT NO JAPÃO [com Gui AvantGarde + Igor BRclub + Fiuk] - Flow #667"
  //   "DR. TONTURA + DILERA + REPÓRTER TOURETTE - Special Talks"
  // Daqui saem os nomes dos convidados, seja quem for.
  function nomesDoEpisodio(tituloEp) {
    const t = String(tituloEp || '').trim();
    if (!t) return { nomes: [], tema: '', apelidos: {} };
    let parte = '', tema = '';
    const apelidos = {};
    const col = t.match(/[\[(]\s*(?:com|c\/|feat\.?|ft\.?)\s+([^\])]+)[\])]/i);
    if (col) { parte = col[1]; tema = t.slice(0, col.index).trim(); }
    else if (/^([^\[(]{3,40})\s*[\[(]([^\])]{3,40})[\])]\s*[-–|]/.test(t)) {
      // "RAUL SENA [INVESTIDOR SARDINHA] - Flow #673": nome + apelido
      const m = t.match(/^([^\[(]{3,40})\s*[\[(]([^\])]{3,40})[\])]/);
      parte = m[1].trim(); apelidos[norm(m[1])] = m[2].trim();
    }
    else {
      const corte = t.search(/\s[-–|]\s(?=[^-–|]*$)/); // último " - " ou " | "
      parte = corte > 0 ? t.slice(0, corte) : t;
      const pedacos = parte.split(/\s*(?:\+|&|,|\se\s)\s*/i);
      const pareceNomes = pedacos.length > 1 ? pedacos.every(x => x.trim().split(/\s+/).length <= 4) : parte.split(/\s+/).length <= 4;
      if (!pareceNomes) { tema = parte; parte = ''; }
    }
    const nomes = parte.split(/\s*(?:\+|&|,|\se\s)\s*/i).map(n => n.replace(/[\[\]()]/g, '').trim())
      .filter(n => n.length >= 2 && n.split(/\s+/).length <= 5 && !APRESENTADORES.includes(norm(n)) && !/^flow\b/i.test(n));
    return { nomes: [...new Set(nomes)].slice(0, 4), tema, apelidos };
  }
  const nomeDoEpisodio = t => nomesDoEpisodio(t).nomes[0] || null;

  // "EDU FALASCHI" -> "Edu Falaschi" (para procurar na Wikipédia)
  const titulo1 = n => n.toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
    .replace(/\s(De|Da|Do|Das|Dos|E)\s/g, m => m.toLowerCase());

  function lerExtras(textoExtras) {
    // Formato, uma linha por convidado:  Nome = busca 1; busca 2; busca 3
    return String(textoExtras || '').split(/\r?\n/).map(l => l.trim()).filter(l => l && l.includes('=')).map(l => {
      const [nome, resto] = l.split('=');
      const buscas = resto.split(';').map(s => s.trim()).filter(Boolean);
      const n = norm(nome);
      return { nome: nome.trim(), apelidos: [n], buscas: buscas.length ? buscas : [nome.trim()], exige: [n], temas: [], extra: true, exigePorBusca: true };
    }).filter(c => c.apelidos[0]);
  }

  function detectar({ titulo, descricao, tags, tituloEpisodio, extras, wiki, transcricao, segs }) {
    const desc = limparDescricao(descricao);
    // convidado extra com o mesmo nome de um da lista: junta as buscas dos dois
    const todos = CONVIDADOS.map(c => ({ ...c }));
    for (const x of lerExtras(extras)) {
      const igual = todos.find(c => norm(c.nome) === norm(x.nome));
      if (igual) igual.extrasBuscas = x.buscas; else todos.unshift(x);
    }
    const textoWiki = Object.values(wiki || {}).join(' \n ');
    const fontesNomes = [[titulo, 3], [tituloEpisodio, 3], [desc, 1], [(tags || []).join(' , '), 1]];
    // a descrição do Flow é quase toda patrocínio ("Aprenda IA…", "Black Friday"), então não conta para o assunto
    // o assunto do CORTE manda; o episódio inteiro só ajuda quando o corte não diz nada
    const fontes = [[titulo, 4], [tituloEpisodio, 1], [(tags || []).join(' , '), 1]];
    const convidados = [];
    for (const c of todos) {
      let pontos = 0;
      for (const [txt, peso] of fontesNomes) if (txt && temAlgum(txt, c.apelidos)) pontos += peso;
      if (pontos > 0 && !convidados.some(x => x.nome === c.nome)) convidados.push({ ...c, pontos });
    }
    // QUALQUER convidado: nomes tirados do título do episódio, mesmo que não estejam na lista
    const ep = nomesDoEpisodio(tituloEpisodio);
    for (const nomeEp of ep.nomes) {
      if (convidados.some(c => temAlgum(nomeEp, c.apelidos) || tem(c.nome, norm(nomeEp)))) continue;
      const n = norm(nomeEp);
      const apelido = ep.apelidos[n];
      const noCorte = tem(titulo, n) || n.split(' ').some(w => w.length >= 3 && !FRACAS.includes(w) && !['dr', 'dra', 'professor', 'prof', 'reporter'].includes(w) && tem(titulo, w)) || (apelido && tem(titulo, norm(apelido)));
      const buscas = [titulo1(nomeEp) + ' livro', titulo1(nomeEp)];
      if (apelido) buscas.push(titulo1(apelido) + ' livro', titulo1(apelido));
      convidados.push({ nome: titulo1(nomeEp) + (apelido ? ' (' + titulo1(apelido) + ')' : ''), apelidos: [n, ...(apelido ? [norm(apelido)] : [])], buscas, exige: [n, ...(apelido ? [norm(apelido)] : [])], temas: [], pontos: noCorte ? 3 : 1, desconhecido: true });
    }
    // convidado tirado do PRÓPRIO CORTE: "NOME SOBRENOME: ..." no título e/ou "vou conversar com o Fulano de Tal" na fala
    for (const nomeCorte of nomesNoCorte(titulo, transcricao)) {
      const n = norm(nomeCorte.nome);
      if (convidados.some(c => temAlgum(n, c.apelidos) || temAlgum(c.nome, [n]))) continue;
      const apelidos = [...new Set([n, ...nomeCorte.outros.map(norm)])];
      convidados.push({ nome: nomeCorte.nome, apelidos, buscas: [nomeCorte.nome + ' livro', nomeCorte.nome], exige: apelidos, temas: [], pontos: 4, desconhecido: true });
    }
    // pessoas famosas citadas no título do corte
    const citados = CITADOS.filter(c => temAlgum(titulo, c.apelidos) && !convidados.some(g => temAlgum(g.nome, c.apelidos)));
    convidados.sort((a, b) => b.pontos - a.pontos);
    const temas = [];
    for (const [id, t] of Object.entries(TEMAS)) {
      let pontos = 0;
      for (const [txt, peso] of fontes) if (txt) pontos += Math.min(2, contar(txt, t.chaves)) * peso;
      if (textoWiki) pontos += Math.min(2, contar(textoWiki, t.chaves)); // profissão do convidado (Wikipédia)
      for (const c of convidados) if ((c.temas || []).includes(id)) pontos += 2; // assunto típico do convidado
      // a fala do corte (legenda automática) conta como assunto DO CORTE
      const naFala = transcricao ? frequencia(transcricao, t.chaves) : 0;
      pontos += Math.min(6, naFala);
      const doCorte = contar(titulo || '', t.chaves) > 0 || naFala >= 3;
      if (pontos >= 1) temas.push({ id, nome: t.nome, pontos: pontos + (doCorte ? 10 : 0), doCorte });
    }
    temas.sort((a, b) => b.pontos - a.pontos);
    // se o corte tem assunto claro, os assuntos fracos (só do episódio) ficam de fora
    temas.forEach(t => { if (t.doCorte) t.pontos -= 10; });
    const forte = temas.filter(t => t.pontos >= 2 || t.doCorte);
    const nomesConv = convidados.flatMap(c => [...(c.apelidos || []), norm(c.nome)]).join(' ').split(' ');
    const nomesCit = citados.flatMap(c => c.apelidos).join(' ').split(' ');
    const temasFinais = (forte.length ? forte : temas).slice(0, 3);
    const jaNoAssunto = w => temasFinais.some(t => temAlgum(w, TEMAS[t.id].chaves));
    // com legenda, as palavras mais faladas valem sozinhas (judeu, judaísmo, israel), mesmo que já sejam de um assunto
    const fala = transcricao ? palavrasDaFala(transcricao, [...nomesConv, ...nomesCit]) : [];
    const doTitulo = palavrasDoTitulo(titulo, [...nomesConv, ...nomesCit]).filter(w => !jaNoAssunto(w));
    // palavras que aparecem no título E na fala vêm primeiro; depois as mais faladas; depois as do título
    const ambos = doTitulo.filter(w => fala.some(f => f.startsWith(w.slice(0, 5))));
    // com legenda: só palavras FALADAS (as do título que ninguém fala, tipo "conflitos", "poderia", ficam de fora)
    const palavras = transcricao && fala.length ? [...new Set([...fala.slice(0, 4), ...ambos])].slice(0, 4) : [...new Set([...ambos, ...fala.slice(0, 3), ...doTitulo])].slice(0, 4);
    return { citados, convidados: convidados.slice(0, 4), temas: temasFinais, palavras, fala, livros: segs ? livrosCitados(semPropaganda(segs)) : [], assuntos: segs ? assuntosDaFala(segs) : [], falaTexto: transcricao || '', segsFala: segs ? semPropaganda(segs) : [] };
  }

  // Nome do convidado dentro do corte. Título no formato "BRENO ALTMAN: um judeu diferente" (aceito só se o
  // nome aparecer com letra maiúscula na fala, para não confundir com "GUERRA NUCLEAR:") e a apresentação
  // na fala ("hoje eu vou conversar com o Breno Altman"). A grafia da fala vale mais que a do título.
  const MAIUSC = 'A-ZÀ-ÖØ-Þ', MINUSC = 'a-zß-öø-ÿ';
  function nomesNoCorte(titulo, fala) {
    const out = [];
    const palavraNome = w => w.length >= 3 && !VAZIAS.has(norm(w)) && !FALA_VAZIAS.has(norm(w)) && !FRACAS.includes(norm(w));
    let doTitulo = null;
    const mt = new RegExp('^\\s*([' + MAIUSC + '][' + MAIUSC + MINUSC + ']+(?:\\s+[' + MAIUSC + '][' + MAIUSC + MINUSC + ']+){1,2})\\s*[:|–-]').exec(titulo || '');
    if (mt && mt[1].split(/\s+/).every(palavraNome)) doTitulo = titulo1(mt[1]);
    let daFala = null;
    if (fala) {
      const inicio = fala.slice(0, Math.max(1500, Math.floor(fala.length * 0.25)));
      const nome = '([' + MAIUSC + '][' + MINUSC + ']+(?:\\s+(?:de |da |do |dos |das )?[' + MAIUSC + '][' + MINUSC + ']+){1,3})';
      const mf = new RegExp('\\b(?:conversar com|conversando com|conversa com|recebendo|receber|entrevistar|entrevistando|papo com|nosso convidado(?: de hoje)?(?: é)?|minha convidada(?: de hoje)?(?: é)?|meu convidado(?: de hoje)?(?: é)?)\\s+(?:o |a |os |as )?' + nome).exec(inicio);
      if (mf && mf[1].split(/\s+/).filter(w => !/^(de|da|do|dos|das)$/.test(w)).every(palavraNome)) daFala = mf[1];
      // nome do título só vale se o primeiro nome aparecer com maiúscula na fala
      if (doTitulo && !new RegExp('\\b' + doTitulo.split(' ')[0] + '\\b').test(fala)) doTitulo = null;
    }
    if (daFala && doTitulo && norm(daFala).split(' ')[0] === norm(doTitulo).split(' ')[0]) out.push({ nome: daFala, outros: norm(daFala) === norm(doTitulo) ? [] : [doTitulo] });
    else { if (daFala) out.push({ nome: daFala, outros: [] }); if (doTitulo) out.push({ nome: doTitulo, outros: [] }); }
    return out;
  }
  // quantas vezes os termos aparecem no texto (termo com * = começa com)
  function frequencia(texto, termos) {
    const t = ' ' + norm(texto) + ' ';
    let n = 0;
    for (const termo of termos) {
      const pref = termo.endsWith('*'), p = norm(pref ? termo.slice(0, -1) : termo);
      if (!p) continue;
      const re = new RegExp(' ' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (pref ? '' : ' '), 'g');
      n += (t.match(re) || []).length;
    }
    return n;
  }

  // Assuntos centrais da FALA: as palavras com conteúdo mais repetidas na legenda (sem IA, só contagem).
  const FALA_VAZIAS = new Set(('visao diferente diferentes normal normais verdade questao situacao problema problemas lugar parte partes ' +
    'conversa conversar conversando ideia ideias exemplo certo certa errado claro outra outro outras outros mesma mesmo mesmos ' +
    'grande grandes pequeno maior menor melhor pior primeiro primeira ultimo ultima todos todas cada qualquer tanto tanta ' +
    'entao tipo assim cara mano velho ne nao sim tipo aham uhum olha olhar ouvir escuta entendeu entende ' +
    'sabe saber sei sabia acho acha achar acredito pensar penso pensando falar falei falou falando dizer disse dizendo fazer faz fazendo feito ' +
    'estar estou esta estava estavam estao estamos ficar fica ficou ter tenho tinha tinham temos teve tiveram poder pode podia posso podem ' +
    'querer quero queria quer precisa precisar preciso vamos vou vai ia iam fui foram sendo sido seria seriam isso aquilo essa esse esses essas ' +
    'aquela aquele aqueles daquela daquele dessa desse disso nisso naquela naquele pessoal pessoa pessoas gente galera mundo ninguem alguem ' +
    'alguma algum algumas alguns muito muita muitos muitas pouco pouca bastante demais coisa coisas negocio negocios parada jeito forma maneira ' +
    'tempo tempos hora horas vezes momento momentos agora hoje ontem amanha depois antes sempre nunca ainda tambem inclusive exatamente ' +
    'realmente basicamente simplesmente justamente obviamente literalmente verdade certo certa errado claro tranquilo beleza pronto enfim ' +
    'porque porem embora entretanto todavia contudo quando onde como qual quais quanto quanta quantos quantas quem cujo outro outra outros ' +
    'outras mesmo mesma mesmos mesmas proprio propria tanto tanta tantos tantas todo toda todos todas cada qualquer quaisquer nenhum nenhuma ' +
    'lugar parte lado frente atras dentro fora cima baixo perto longe ano anos mes meses semana semanas primeiro primeira segundo segunda ' +
    'terceiro ultimo ultima grande grandes pequeno pequena maior menor melhor pior bom boa bons boas mal mau legal bacana doido doida louco ' +
    'louca historia historias exemplo caso casos ideia ideias problema problemas questao situacao sentido nivel tipos vida vidas cabeca ' +
    'dinheiro trabalho casa familia filho filha amigo amiga obrigado obrigada podcast flow igor monark episodio programa video videos canal ' +
    'chegar chegou chega voltar voltou volta passar passou passa entrar entrou sair saiu deixar deixou deixa colocar colocou botar botou ' +
    'pegar pegou pega levar levou leva achei ficando tava tavam tinha teria terao seja sejam fosse fossem estivesse tivesse houve haver').split(' '));
  function palavrasDaFala(texto, ignorar = []) {
    const fora = new Set(ignorar.filter(Boolean));
    const cont = new Map();
    for (const w of norm(texto).split(' ')) {
      if (w.length < 5 || /\d/.test(w) || VAZIAS.has(w) || FALA_VAZIAS.has(w) || fora.has(w)) continue;
      cont.set(w, (cont.get(w) || 0) + 1);
    }
    // junta plural/singular simples ("bancos" + "banco")
    for (const [w, n] of [...cont]) if (w.endsWith('s') && cont.has(w.slice(0, -1))) { cont.set(w.slice(0, -1), cont.get(w.slice(0, -1)) + n); cont.delete(w); }
    return [...cont].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
  }

  // LIVROS CITADOS na fala: o que vem depois de "o livro", "a obra", "livro chamado"… até a pontuação.
  const INICIO_RUIM = /^(que|e|é|foi|um|uma|isso|esse|essa|dele|dela|meu|minha|seu|sua|novo|nova|inteiro|todo|toda|aqui|ali|lá|né|tá|pra|para|de|do|da|no|na)\b/i;
  function livrosCitados(segs) {
    const out = [], vistos = new Set();
    const re = /\b(?:o |um |seu |meu |esse |nesse |no )?(?:livro|obra|best[- ]?seller)\s+(?:chamad[oa]\s+|que se chama\s+|intitulad[oa]\s+)?["“'‘]?([^,.;:!?"”’\n]{3,60})/gi;
    for (const sg of segs) {
      let m;
      while ((m = re.exec(sg.texto))) {
        let t = m[1].trim().split(/\s+(?:e|que|mas|porque|aí|então|né|tá|foi|é|era|onde|quando|pra|para)\s+/i)[0].split(/\s+/).slice(0, 6).join(' ');
        if (INICIO_RUIM.test(t) || palavrasFortes(t).length < 1) continue;
        const k = norm(t);
        if (k.length < 4 || vistos.has(k)) continue;
        vistos.add(k); out.push({ titulo: t, tempo: Math.floor(sg.ini) });
      }
    }
    return out.slice(0, 6);
  }
  // Momento em que as palavras do produto mais aparecem na fala (janela de 60 s).
  function momentoNaFala(segs, chaves) {
    if (!segs || !segs.length || !chaves || !chaves.length) return null;
    const hits = segs.map(sg => ({ t: sg.ini, n: frequencia(sg.texto, chaves) })).filter(h => h.n > 0);
    if (!hits.length) return null;
    let melhor = null;
    for (const h of hits) {
      const soma = hits.filter(x => x.t >= h.t && x.t < h.t + 60).reduce((a, x) => a + x.n, 0);
      if (!melhor || soma > melhor.soma) melhor = { t: h.t, soma };
    }
    return Math.floor(melhor.t);
  }
  // Põe cada produto no trecho mais perto do momento em que ele é falado; os sem momento
  // (coringas etc.) ficam com os trechos que sobrarem, sem empurrar os outros.
  function atribuirTrechos(plano, prefs) {
    const livres = new Set(plano.map((_, i) => i));
    const linhaDoTrecho = new Array(plano.length).fill(null);
    const comMomento = prefs.map((t, linha) => ({ t, linha })).filter(x => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
    for (const { t, linha } of comMomento) {
      let melhor = null;
      for (const i of livres) {
        const meio = plano[i].inicio + (plano[i].fim - plano[i].inicio) / 2;
        const d = Math.abs(meio - t);
        if (melhor === null || d < melhor.d) melhor = { i, d };
      }
      if (melhor) { linhaDoTrecho[melhor.i] = linha; livres.delete(melhor.i); }
    }
    const semMomento = prefs.map((t, linha) => ({ t, linha })).filter(x => !Number.isFinite(x.t)).map(x => x.linha);
    for (const i of [...livres].sort((a, b) => a - b)) linhaDoTrecho[i] = semMomento.shift();
    return linhaDoTrecho;
  }

  // Palavras "de assunto" do título do corte: tira artigos, verbos de chamada ("revela", "quebrou"),
  // adjetivos de clique ("obscura", "bizarro"), risadas e nomes de pessoas. O que sobra vira busca.
  const VAZIAS = new Set(('diferente diferentes normal normais a o os as e e de da do das dos em no na nos nas num numa um uma uns umas que com sem por para pra pro pros sobre ' +
    'ser foi era sao tem ter vai vao ja muito muita mais menos como quando onde porque qual quais quem esse essa esses essas isso este esta isto ' +
    'aquele aquela ele ela eles elas voce voces vc seu sua seus suas meu minha nosso nossa nao sim so tudo nada todo toda todos todas aqui ali la ' +
    'agora hoje ontem depois antes ate entre contra desde cada outro outra mesmo mesma ainda tambem sempre nunca vez vezes coisa coisas gente cara ' +
    'verdade verdadeiro verdadeira obscura obscuro obscuras obscuros real reais realmente sincero sincera sinceridade quebrou quebra quebrado ' +
    'perdeu perdendo perde cabeca paciencia bizarro bizarra bizarros pior piores melhor melhores maior maiores menor grande grandes pequeno ' +
    'incrivel absurdo absurda louco louca loucura chocante momento acontecendo aconteceu acontece explica explicou explicando fala falou falando ' +
    'conta contou contando revela revelou desabafa desabafo analisa analise reflexao aula polemica polemico treta tretas vergonha medo comemorando ' +
    'solta verbo abre jogo fim inicio regra regras velada segredo segredos ninguem alguem sabe saber sabia queria quer pode poder deve ' +
    'acha acho fez faz fazer dizer disse diz pensa pensar ver viu olha historia historias caso casos tipo jeito parte vida novo nova noite dia ' +
    'esclarece tudo sobre igor flow podcast monark convidado convidada episodio corte cortes ao aos esta estao seria sera eram foram ' +
    'tras partir pouca pouco poucos poucas conhece conhecem conhecer fica ficou ficar deu dar vem veio vira virou sai saiu chega chegou manda mandou ' +
    'entra entrou mostra mostrou mudou muda mudar acabou acaba cuidado atencao urgente exclusivo completo inteiro sabe sabem quanto quanta ' +
    'assim entao enquanto lugar forma maneira certo errado errou acertou erraram acertaram ficaram mundo pessoas pessoa parece parecer pais ' +
    'estranho estranha estranhos simples facil dificil unico unica deixa deixou deixar perigoso perigosa importante serio seria assustador triste engracado').split(' '));
  const CURTAS_VALEM = new Set(['6x1', 'stf', 'pcc', 'eua', 'ufc', 'gta', 'ps5', 'f1', 'ia', 'pix', 'mbl', 'tse', 'clt', 'inss', 'sus', 'otan']);
  function palavrasDoTitulo(titulo, ignorar = []) {
    const fora = new Set(ignorar.filter(Boolean));
    const vistas = new Set(), out = [];
    for (let w of norm(titulo).split(' ')) {
      w = w.replace(/(k)\1{2,}$/, '$1').replace(/k{2,}$/, ''); // "FIUKKKKK" -> "fiuk"
      if (!w || vistas.has(w) || VAZIAS.has(w) || FALA_VAZIAS.has(w) || fora.has(w) || APRESENTADORES.includes(w)) continue;
      if (/^k{2,}$|^(ha)+$|^(rs)+$/.test(w)) continue;
      if (w.length < 4 && !CURTAS_VALEM.has(w)) continue;
      if (/^\d+$/.test(w)) continue;
      vistas.add(w); out.push(w);
    }
    return out.slice(0, 3);
  }

  // Monta a fila de buscas: convidado primeiro, depois assuntos, depois o padrão.
  // Lojas muitas vezes não escrevem "Livro" no nome ("Geografia Política e Geopolítica").
  // Então o grupo "livro" não é exigido; em troca, recusa brinde/roupa nas buscas de livro.
  const PALAVRAS_LIVRO = ['livro', 'livros', 'livro*', 'box', 'manual', 'curso'];
  const RECUSA_LIVRO = ['camiseta', 'camisa', 'caneca', 'adesivo', 'quadro', 'poster', 'chaveiro', 'pelucia', 'fantoche', 'boneco', 'moletom', 'bone', 'capinha', 'case', 'mousepad'];
  function semLivro(exige) {
    const resto = exige.filter(g => !g.every(w => PALAVRAS_LIVRO.includes(w)));
    return resto.length ? resto : exige;
  }
  const ehPessoa = t => /\([^)]*\b(1[89]\d\d|20[0-2]\d)\b[^)]*\)/.test(t) || /\b[ée] (um|uma) [^.]{0,60}\b(brasileir[oa]|portugu[eê]s[a]?)\b/i.test(t);
  const ehBuscaDeLivro = b => /^(livro|box)\b/i.test(norm(b));
  // nome de uma palavra só ("Rubão") tem muito xará: o produto precisa ter também palavra do assunto
  const umaPalavra = c => !c.extra && c.desconhecido && norm(c.nome.replace(/\(.*\)/, '')).split(' ').length === 1;

  function planoDeBuscas(det, coringas) {
    const fila = [];
    // o que a pessoa digitou em "Assunto do corte" vem antes de tudo
    for (const d of det.dicas || []) {
      const fortes = palavrasFortes(d);
      if (!fortes.length) continue;
      const ex = fortes.map(w => [w.length > 4 ? w.slice(0, w.length - 1) + '*' : w]);
      fila.push({ busca: 'livro ' + d, exige: ex, recusa: RECUSA_LIVRO, origem: 'citado', rotulo: 'assunto digitado', chaves: fortes });
      fila.push({ busca: d, exige: ex, recusa: ['adesivo', 'capinha', 'case', 'pelicula'], origem: 'citado', rotulo: 'assunto digitado', chaves: fortes });
    }
    // livros citados na fala (legenda do Studio)
    for (const l of det.livros || []) {
      const fortes = palavrasFortes(l.titulo).slice(0, 4);
      if (fortes.length < 1) continue;
      fila.push({ busca: 'livro ' + l.titulo, exige: [[fortes[0].length > 4 ? fortes[0].slice(0, fortes[0].length - 1) + '*' : fortes[0]]], recusa: RECUSA_LIVRO, origem: 'citado', rotulo: 'livro citado na fala', chaves: fortes, tempo: l.tempo });
    }
    // ASSUNTOS DA FALA: o que o corte mais repete, cada um com o momento em que é falado
    for (const a of det.assuntos || []) {
      for (const [b, exige, recusa] of a.buscas.slice(0, a.n >= 10 ? 2 : 1)) {
        fila.push({ busca: b, exige: semLivro(exige), recusa: [...(recusa || []), ...(ehBuscaDeLivro(b) || exige.some(g => g.includes('livro')) ? RECUSA_LIVRO : [])], origem: 'fala', rotulo: 'assunto da fala', chaves: a.chaves, tempo: a.tempo });
      }
    }
    // palavras mais faladas no corte: busca direta ("livro judeu", "judaísmo"…), logo depois dos assuntos
    // (palavra que já está numa expressão buscada, tipo "estado" em "criação do estado de israel", não repete)
    const expr = det.falaTexto ? expressoesDaFala(det.falaTexto).filter(x => x.n >= 3).map(x => x.frase.split(' ')) : [];
    const emExpressao = w => expr.some(ws => ws.includes(w));
    if (det.falaTexto && (det.fala || []).length) {
      for (const w of (det.fala || []).filter(w => !emExpressao(w)).slice(0, 3)) {
        const ex = [[w.length > 4 ? w.slice(0, Math.max(4, w.length - 2)) + '*' : w]];
        fila.push({ busca: 'livro ' + w, exige: ex, recusa: RECUSA_LIVRO, origem: 'fala', rotulo: 'palavra mais falada', chaves: [w], tempo: momentoNaFala(det.segsFala || [], [w]) });
        fila.push({ busca: w, exige: ex, recusa: ['adesivo', 'capinha', 'case', 'pelicula'], origem: 'fala', rotulo: 'palavra mais falada', chaves: [w], tempo: momentoNaFala(det.segsFala || [], [w]) });
      }
    }
    const chavesAssunto = det.temas.flatMap(t => TEMAS[t.id].chaves);
    // a lista fixa de cada assunto gira conforme o corte, para não sair sempre a mesma ordem
    const girar = lista => { const k = lista.length ? (det.semente || 0) % lista.length : 0; return [...lista.slice(k), ...lista.slice(0, k)]; };
    const chavesDaBusca = b => palavrasFortes(b).map(w => w.length > 4 ? w.slice(0, w.length - 1) + '*' : w);
    // com a fala do corte em mãos, da lista fixa do assunto só entra o que foi falado (nada de "Terço" num papo sobre judaísmo)
    const falada = b => !det.falaTexto || frequencia(det.falaTexto, chavesDaBusca(b)) > 0;
    for (const c of det.citados || []) {
      for (const b of c.buscas) fila.push({ busca: b, exige: [c.exige], recusa: [], origem: 'citado', rotulo: c.nome, chaves: c.apelidos });
    }
    // o ASSUNTO DO CORTE vem antes do convidado
    for (const t of det.temas.filter(t => t.doCorte)) {
      for (const [b, exige, recusa] of girar(TEMAS[t.id].buscas).filter(([b]) => falada(b))) {
        fila.push({ busca: b, exige: semLivro(exige), recusa: [...(recusa || []), ...(ehBuscaDeLivro(b) || exige.some(g => g.includes('livro')) ? RECUSA_LIVRO : [])], origem: 'tema', rotulo: t.nome, chaves: chavesDaBusca(b) });
      }
    }
    // palavras do título do corte (ex.: "trânsito", "lasanha", "6x1") — o assunto do corte manda
    for (const w of (det.falaTexto && (det.fala || []).length) ? [] : (det.palavras || [])) {
      const ex = [[w.length > 4 ? w.slice(0, Math.max(4, w.length - 2)) + '*' : w]];
      fila.push({ busca: 'livro ' + w, exige: ex, recusa: RECUSA_LIVRO, origem: 'titulo', rotulo: 'título do corte', chaves: [w] });
      fila.push({ busca: w, exige: ex, recusa: ['adesivo', 'capinha', 'case', 'pelicula'], origem: 'titulo', rotulo: 'título do corte', chaves: [w] });
    }
    for (const t of det.temas.filter(t => !t.doCorte)) {
      for (const [b, exige, recusa] of girar(TEMAS[t.id].buscas).filter(([b]) => falada(b))) {
        fila.push({ busca: b, exige: semLivro(exige), recusa: [...(recusa || []), ...(ehBuscaDeLivro(b) || exige.some(g => g.includes('livro')) ? RECUSA_LIVRO : [])], origem: 'tema-ep', rotulo: t.nome, chaves: chavesDaBusca(b) });
      }
    }
    // convidado por último (antes dos coringas): no máximo 2 produtos
    for (const c of det.convidados) {
      for (const b of c.extrasBuscas || []) {
        const exige = tem(b, c.apelidos[0]) ? [c.exige] : palavrasFortes(b).map(w => [w + '*']);
        fila.push({ busca: b, exige: exige.length ? exige : [c.exige], recusa: [], origem: 'convidado', rotulo: c.nome, chaves: c.apelidos });
      }
      const buscasConv = [...c.buscas];
      if (c.desconhecido && det.temas.some(t => t.id === 'musica')) buscasConv.push(c.nome + ' CD', c.nome + ' vinil');
      if (umaPalavra(c) && !chavesAssunto.length) continue; // sem assunto não dá para separar dos xarás
      for (const b of buscasConv) {
        // convidado extra: o produto precisa ter o nome dele OU todas as palavras da busca
        let exige = c.exigePorBusca && !tem(b, c.apelidos[0]) ? palavrasFortes(b).map(w => [w + '*']) : [c.exige];
        if (!exige.length) exige = [c.exige];
        if (umaPalavra(c)) exige = [...exige, chavesAssunto];
        fila.push({ busca: b, exige, recusa: umaPalavra(c) ? RECUSA_LIVRO : [], origem: 'convidado', rotulo: c.nome, chaves: c.apelidos });
      }
    }
    const listaCoringa = (coringas && coringas.length ? coringas : CORINGAS_PADRAO);
    for (const b of listaCoringa) {
      const ex = palavrasFortes(b).map(w => [w + '*']);
      if (ex.length) fila.push({ busca: b, exige: ex, recusa: ['capa', 'case', 'pelicula', 'adesivo'], origem: 'coringa', rotulo: 'Coringa' });
    }
    const vistos = new Set();
    return fila.filter(q => { const k = norm(q.busca); if (vistos.has(k)) return false; vistos.add(k); return true; });
  }

  const FRACAS = ['livro', 'livros', 'para', 'com', 'kit', 'box', 'de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a', 'os', 'as', 'um', 'uma', 'que', 'cd', 'lp'];
  const palavrasFortes = b => norm(b).split(' ').filter(w => w.length >= 3 && !FRACAS.includes(w));

  function aceita(nomeProduto, q) {
    if (!nomeProduto) return false;
    if ((q.recusa || []).some(r => tem(nomeProduto, r))) return false;
    return q.exige.every(grupo => temAlgum(nomeProduto, grupo));
  }

  const INDISPONIVEL = /\b(?:esgotad[oa]s?|indispon[ií]ve(?:l|is)|sem estoque|fora de estoque|n[aã]o dispon[ií]ve(?:l|is)|out of stock|sold out|unavailable)\b/i;

  // Dois anúncios do mesmo produto (ex.: "Pai Rico Pai Pobre" de lojas diferentes) contam como repetidos:
  // compara as 3 primeiras palavras principais do nome.
  const SEM_PESO = ['edicao', 'atualizada', 'ampliada', 'nova', 'novo', 'capa', 'comum', 'dura', 'versao', 'original', 'lacrado', 'black', 'friday', 'oferta', 'promocao', 'frete', 'gratis'];
  function chaveProduto(nome) {
    return palavrasFortes(nome).filter(w => !SEM_PESO.includes(w) && !/^\d+$/.test(w));
  }
  function repetido(a, b) {
    const x = chaveProduto(a), y = chaveProduto(b);
    const k = Math.min(3, x.length, y.length);
    if (!k) return norm(a) === norm(b);
    return x.slice(0, k).join(' ') === y.slice(0, k).join(' ');
  }

  // Ordem: assunto digitado → livro citado na fala → assuntos da fala → pessoa citada (até 3) → assunto do corte
  // → palavras do título → assunto do episódio → convidado (até 2) → coringa.
  // Máximo 1 produto por busca (2 para o convidado) e nunca dois iguais.
  // Produtos usados nos cortes recentes ficam para o fim: só entram se faltar produto.
  function escolher(achados, alvo, recentes = []) {
    const out = [], porBusca = new Map();
    const usado = p => recentes.some(r => repetido(r, p.nome));
    const rodada = (aceitaRecente) => {
      const pega = (lista, teto) => {
        for (const p of lista) {
          if (out.length >= teto) break;
          if (!aceitaRecente && usado(p)) continue;
          if (out.some(o => repetido(o.nome, p.nome))) continue;
          if ((porBusca.get(p.busca) || 0) >= (p.origem === 'convidado' ? 2 : 1)) continue;
          out.push(p); porBusca.set(p.busca, (porBusca.get(p.busca) || 0) + 1);
        }
      };
      pega(achados.filter(p => p.origem === 'citado' && p.rotulo === 'assunto digitado'), alvo);
      pega(achados.filter(p => p.origem === 'citado' && p.rotulo === 'livro citado na fala'), alvo);
      pega(achados.filter(p => p.origem === 'fala'), alvo);      // o que o corte mais fala
      pega(achados.filter(p => p.origem === 'citado'), Math.min(alvo, out.length + 3));
      pega(achados.filter(p => p.origem === 'tema'), alvo);
      pega(achados.filter(p => p.origem === 'titulo'), alvo);
      pega(achados.filter(p => p.origem === 'tema-ep'), alvo);
      pega(achados.filter(p => p.origem === 'convidado'), Math.min(alvo, out.length + 2));
      pega(achados.filter(p => p.origem === 'coringa'), alvo);
    };
    rodada(false);
    if (out.length < alvo && recentes.length) rodada(true);
    for (const p of out) p.recente = usado(p);
    return out;
  }

  // Tempos. Regras do Studio: cada produto tem UM trecho, de 15 a 60 segundos, e o primeiro
  // começa em 0:30 ou depois. Para não sobrar buraco, os trechos ficam COLADOS um no outro
  // (cada um termina onde começa o próximo). Se os produtos não bastarem para cobrir o vídeo
  // todo (cada um cobre no máximo 60 s), os buracos que sobram ficam iguais entre si.
  const TEMPO_MAX = 60, TEMPO_MIN = 16;
  function produtosParaCobrir(duracao) { return Math.max(1, Math.ceil((Math.floor(duracao) - 1 - 30) / TEMPO_MAX)); }
  function planoDeTempos(duracao, n) {
    if (!Number.isFinite(duracao) || n < 1) throw Error('Duração do vídeo não encontrada.');
    const fim = Math.floor(duracao) - 1; // o Studio corta no último segundo inteiro
    const disponivel = fim - 30;
    if (disponivel < TEMPO_MIN) throw Error('Vídeo curto demais para marcar tempos.');
    let inicios;
    if (n * TEMPO_MAX >= disponivel) {
      const passo = disponivel / n; // cobre tudo, sem buraco
      if (passo < TEMPO_MIN) throw Error('Não cabem ' + n + ' tempos de pelo menos ' + TEMPO_MIN + ' segundos neste vídeo.');
      inicios = Array.from({ length: n }, (_, i) => Math.floor(30 + i * passo));
    } else {
      const passo = n > 1 ? (disponivel - TEMPO_MAX) / (n - 1) : 0; // produtos de menos: buracos iguais
      inicios = Array.from({ length: n }, (_, i) => Math.floor(30 + i * passo));
    }
    return inicios.map((ini, i) => ({ indice: i, inicio: ini, fim: Math.min(ini + TEMPO_MAX, inicios[i + 1] ?? fim, fim) }));
  }
  // Tempos PELA FALA: cada produto falado começa no segundo em que é falado; os outros (coringas etc.)
  // tapam os maiores buracos que sobrarem. Volta um trecho por linha: { linha, inicio, fim }.
  function planoPorFala(duracao, prefs) {
    if (!Number.isFinite(duracao)) throw Error('Duração do vídeo não encontrada.');
    const fim = Math.floor(duracao) - 1, n = prefs.length;
    if (fim - 30 < TEMPO_MIN) throw Error('Vídeo curto demais para marcar tempos.');
    if (n * TEMPO_MIN > fim - 30) throw Error('Não cabem ' + n + ' tempos de pelo menos ' + TEMPO_MIN + ' segundos neste vídeo.');
    const lim = t => Math.max(30, Math.min(fim - TEMPO_MIN, Math.floor(t)));
    const pos = []; // { linha, inicio }
    const ocupado = t => pos.some(x => Math.abs(x.inicio - t) < TEMPO_MIN);
    const comMomento = prefs.map((t, linha) => ({ t, linha })).filter(x => Number.isFinite(x.t)).sort((a, b) => a.t - b.t);
    const sobra = prefs.map((t, linha) => ({ t, linha })).filter(x => !Number.isFinite(x.t)).map(x => x.linha);
    for (const { t, linha } of comMomento) {
      // se outro produto já está nesse ponto, empurra no máximo 30 s; passou disso, vai tapar buraco
      let ini = lim(t);
      const teto = Math.min(fim - TEMPO_MIN, ini + 30);
      while (ocupado(ini) && ini < teto) ini++;
      if (ocupado(ini)) sobra.push(linha); else pos.push({ linha, inicio: ini });
    }
    for (const linha of sobra) {
      pos.sort((a, b) => a.inicio - b.inicio);
      // maior pedaço do vídeo que ninguém cobre (cada produto cobre até 60 s)
      let melhor = null;
      const marcos = [{ inicio: 30, vazio: true }, ...pos];
      for (let i = 0; i < marcos.length; i++) {
        const desde = marcos[i].vazio ? 30 : marcos[i].inicio + TEMPO_MAX;
        const ate = i + 1 < marcos.length ? marcos[i + 1].inicio : fim;
        const ini = marcos[i].vazio ? 30 : Math.min(desde, ate);
        if (ate - ini >= TEMPO_MIN && !ocupado(ini) && (!melhor || ate - desde > melhor.vao)) melhor = { ini, vao: ate - desde };
      }
      if (!melhor || melhor.vao <= 0) {
        // vídeo já coberto: divide o trecho mais comprido ao meio
        let maior = null;
        for (let i = 0; i < pos.length; i++) {
          const ate = Math.min(pos[i].inicio + TEMPO_MAX, i + 1 < pos.length ? pos[i + 1].inicio : fim);
          if (ate - pos[i].inicio >= 2 * TEMPO_MIN && (!maior || ate - pos[i].inicio > maior.tam)) maior = { ini: Math.floor((pos[i].inicio + ate) / 2), tam: ate - pos[i].inicio };
        }
        if (!maior && !melhor) throw Error('Não sobrou lugar para todos os tempos.');
        melhor = maior || melhor;
      }
      pos.push({ linha, inicio: melhor.ini });
    }
    pos.sort((a, b) => a.inicio - b.inicio);
    return pos.map((x, i) => ({ indice: i, linha: x.linha, inicio: x.inicio, fim: Math.min(x.inicio + TEMPO_MAX, pos[i + 1] ? pos[i + 1].inicio : fim, fim) }));
  }
  function cobertura(plano, duracao) {
    const coberto = plano.reduce((t, p) => t + (p.fim - p.inicio), 0);
    return { coberto, total: Math.max(0, Math.floor(duracao) - 1 - 30), faltaProdutos: Math.max(0, produtosParaCobrir(duracao) - plano.length) };
  }

  const mmss = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { nomesNoCorte, planoPorFala, assuntosDaFala, expressoesDaFala, semPropaganda, MAPA_FALA, livrosCitados, momentoNaFala, atribuirTrechos, palavrasDaFala, frequencia, palavrasDoTitulo, produtosParaCobrir, cobertura, ehPessoa, repetido, CITADOS, CORINGAS_PADRAO, norm, tem, detectar, planoDeBuscas, aceita, escolher, planoDeTempos, linkEpisodio, nomeDoEpisodio, nomesDoEpisodio, titulo1, limparDescricao, lerExtras, CONVIDADOS, TEMAS, INDISPONIVEL };
    return;
  }

  // ====================================================================================
  //  PARTE QUE MEXE NA TELA DO STUDIO
  // ====================================================================================

  const cfg = {
    alvo: Number(GM_getValue('alvo', 10)) || 10,
    auto: GM_getValue('auto', true) !== false,
    maximo: Number(GM_getValue('maximo', 10)) || 10,
    minimo: Number(GM_getValue('minimo', 5)) || 5,
    extras: String(GM_getValue('extras', '')),
    dica: '',
    coringas: String(GM_getValue('coringas', CORINGAS_PADRAO.join('\n'))),
  };
  const listaCoringas = () => cfg.coringas.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const log = [];
  let ocupado = false, parar = false, etapa = 'inicio', ultimaDeteccao = null, ultimosEscolhidos = [], ultimosCandidatos = [], ultimaCobertura = null, ultimasFrases = null;

  const espera = ms => new Promise(r => setTimeout(r, ms));
  const humano = () => espera(450 + Math.random() * 500);
  function registrar(msg, extra) {
    log.push({ t: new Date().toISOString().slice(11, 19), msg, ...(extra ? { extra } : {}) });
    if (log.length > 400) log.shift();
    status(msg);
  }

  // Studio usa "shadow DOM": é preciso entrar em cada sombra para achar os botões.
  function raizes(root = document) {
    const out = [root];
    if (root.shadowRoot) out.push(root.shadowRoot);
    for (let i = 0; i < out.length; i++) for (const el of out[i].querySelectorAll('*')) if (el.shadowRoot) out.push(el.shadowRoot);
    return out;
  }
  const todos = (sel, root = document) => raizes(root).flatMap(r => [...r.querySelectorAll(sel)]);
  const visivel = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const habilitado = el => !!el && el.disabled !== true && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true';
  const pai = el => el.parentElement || el.getRootNode()?.host || null;
  const dentro = (painel, el) => { for (let p = el; p; p = pai(p)) if (p === painel) return true; return false; };
  const umVisivel = lista => { const v = [...new Set(lista)].filter(visivel); return v.length ? v[0] : null; };

  function campo(tipo) {
    const sel = { titulo: ['#title-textarea #textbox', '#title-textarea textarea'], descricao: ['#description-textarea #textbox', '#description-textarea textarea'] }[tipo];
    for (const s of sel) { const el = umVisivel(todos(s)); if (el) return el; }
    const rot = tipo === 'titulo' ? /^(Título|Title)/i : /^(Descrição|Description)/i;
    return umVisivel(todos('textarea,[contenteditable="true"]').filter(el => rot.test(el.getAttribute('aria-label') || '')));
  }
  const textoDe = el => !el ? '' : (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') ? el.value : el.innerText;

  // Título com TESTE A/B: o campo normal pode sumir ou virar vários títulos (A, B, C).
  // Junta todos os títulos que achar; se não achar nenhum campo, usa o nome do vídeo
  // na barra da esquerda e, por último, o título público do vídeo (oEmbed).
  async function lerTitulo() {
    const visto = new Set(), titulos = [];
    const add = t => { t = String(t || '').replace(/\s+/g, ' ').trim(); if (t && t.length > 3 && !visto.has(t)) { visto.add(t); titulos.push(t); } };
    add(textoDe(campo('titulo')));
    // campos de título do teste A/B ("Título 1", "Título 2", "Title A"…)
    for (const el of todos('textarea,[contenteditable="true"],input[type="text"]')) {
      const rot = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || '');
      if (/^(T[ií]tulo|Title)\b/i.test(rot) && visivel(el)) add(textoDe(el));
    }
    // cartões do teste A/B que mostram os títulos como texto
    for (const el of todos('[id*="title" i], [class*="title" i]')) {
      const host = el.closest && el.closest('[class*="test" i], [id*="test" i], [class*="experiment" i], [id*="experiment" i]');
      if (host && visivel(el) && !el.children.length) add(el.textContent);
    }
    if (titulos.length) return titulos.join(' | ');
    // barra da esquerda: "Seu vídeo" + nome do vídeo
    const nome = umVisivel(todos('ytcp-navigation-drawer #entity-name, ytcp-navigation-drawer .entity-name, #entity-name, .entity-name, ytcp-video-info #video-title'));
    if (nome) { add(nome.textContent); if (titulos.length) return titulos[0]; }
    // título público
    const id = (location.pathname.match(/\/video\/([A-Za-z0-9_-]{11})/) || [])[1];
    if (id) { try { const t = await tituloOEmbed(id); if (t) return t; } catch {} }
    return '';
  }
  function lerTags() {
    return [...new Set(todos('ytcp-video-tags ytcp-chip, ytcp-chip-bar ytcp-chip, #chip-bar ytcp-chip').map(c => (c.innerText || c.textContent || '').trim()).filter(Boolean))].slice(0, 60);
  }

  // Painel da frente (diálogo "Marcar produtos" ou "Adicionar marcações de tempo")
  function painelProdutos() {
    const dialogos = [...new Set(todos('ytcp-dialog, tp-yt-paper-dialog, [role="dialog"]').filter(visivel))];
    const comTitulo = re => dialogos.filter(d => re.test((d.innerText || '').trim()));
    // o menor diálogo que começa com o título é o certo
    const ordenar = l => l.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
    const marcar = ordenar(comTitulo(/^Marcar produtos\b/));
    if (marcar.length) return { tipo: 'seletor', el: marcar[0] };
    const tempos = ordenar(comTitulo(/^Adicionar marcações de tempo\b/));
    if (tempos.length) return { tipo: 'tempos', el: tempos[0] };
    return null;
  }

  function contagemMarcados(painel) {
    const txt = painel.innerText || '';
    if (/Nenhum produto marcado/.test(txt)) return 0;
    const n = [...new Set([...txt.matchAll(/\b(\d+) produtos? marcados?\b/g)].map(m => Number(m[1])))];
    if (n.length !== 1) return null;
    return n[0];
  }

  function linhasDeProduto(painel) {
    return todos('ytshopping-product', painel).map(el => {
      const nomeEl = todos('div[role="button"]', el).find(b => (b.textContent || '').trim());
      const nome = nomeEl ? nomeEl.textContent.trim() : '';
      for (let escopo = el; escopo && escopo !== painel && dentro(painel, escopo); escopo = pai(escopo)) {
        const qtd = todos('ytshopping-product', escopo).length + (escopo === el ? 1 : 0);
        if (qtd > 1) break;
        const botoes = todos('ytcp-icon-button', escopo).filter(b => ['Marcar', 'Excluir marcação'].includes((b.getAttribute('aria-label') || b.getAttribute('title') || '').trim()));
        if (botoes.length === 1 && nome) {
          const marcado = (botoes[0].getAttribute('aria-label') || botoes[0].getAttribute('title') || '').trim() === 'Excluir marcação';
          const texto = raizes(escopo).map(r => r.textContent || '').join(' ');
          return { el, nome, botao: botoes[0], marcado, indisponivel: INDISPONIVEL.test(texto) || !habilitado(botoes[0]) };
        }
      }
      return { el, nome, botao: null };
    }).filter(r => r.nome && r.botao);
  }

  async function abrirSeletor() {
    let p = painelProdutos();
    if (p?.tipo === 'seletor') return p.el;
    if (p?.tipo === 'tempos') {
      const voltar = umVisivel(todos('#timestamp-editor-back-button', p.el));
      if (!habilitado(voltar)) throw Error('Não achei o botão Voltar do editor de tempos.');
      voltar.click();
    } else {
      // Aba Detalhes > botão Produtos > Editar produtos
      const aba = umVisivel(todos('[role="tab"]').filter(t => /^Detalhes$/.test((t.textContent || '').trim())));
      if (aba && aba.getAttribute('aria-selected') !== 'true') { aba.click(); await espera(800); }
      let editar = umVisivel(todos('#shopping-toolbar-edit'));
      if (!habilitado(editar)) {
        const entrada = umVisivel(todos('#products-description-button')) ||
          umVisivel(todos('button, ytcp-button').filter(b => /^(Produtos|Products)$/.test((b.textContent || '').trim())));
        if (!habilitado(entrada)) throw Error('Não achei o botão "Produtos" na aba Detalhes. O canal está com o YouTube Shopping ativo?');
        entrada.scrollIntoView({ block: 'center' }); entrada.click();
        for (let i = 0; i < 50 && !habilitado(editar = umVisivel(todos('#shopping-toolbar-edit'))); i++) await espera(150);
      }
      if (habilitado(editar)) { editar.scrollIntoView({ block: 'center' }); editar.click(); }
    }
    for (let i = 0; i < 60; i++) { p = painelProdutos(); if (p?.tipo === 'seletor') return p.el; await espera(200); }
    throw Error('O Studio não abriu a janela "Marcar produtos".');
  }

  function escreverCampo(input, valor) {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    for (const tipo of ['keydown', 'keypress', 'keyup']) input.dispatchEvent(new KeyboardEvent(tipo, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, composed: true, cancelable: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function buscar(painel, texto) {
    const campoBusca = umVisivel(todos('input#search-input', painel)) || umVisivel(todos('input[role="searchbox"], input[type="search"]', painel));
    if (!campoBusca) throw Error('Não achei o campo de busca da janela "Marcar produtos".');
    const antes = JSON.stringify(linhasDeProduto(painel).map(r => r.nome));
    escreverCampo(campoBusca, texto);
    const inicio = Date.now(); let anterior = '', estavel = 0;
    while (Date.now() - inicio < 15000) {
      await espera(500);
      if (parar) throw Error('Parado por você.');
      const txt = painel.innerText || '';
      const vazio = /Nenhum produto encontrado|Nenhum resultado|Não encontramos|Nada encontrado|Não há produtos|Sem resultados/i.test(txt);
      const agora = JSON.stringify(linhasDeProduto(painel).map(r => r.nome));
      estavel = agora === anterior ? estavel + 1 : 0; anterior = agora;
      if (vazio && Date.now() - inicio > 1200) return [];
      if (estavel >= 2 && (agora !== antes || Date.now() - inicio > 4000)) break;
    }
    return linhasDeProduto(painel);
  }

  async function marcarUm(painel, linha) {
    const antes = contagemMarcados(painel);
    linha.botao.scrollIntoView({ block: 'center' });
    await humano();
    linha.botao.click();
    for (let i = 0; i < 35; i++) {
      await espera(100);
      const agora = contagemMarcados(painel);
      if (antes !== null && agora === antes + 1) return true;
    }
    return false;
  }

  // ---------- etapa 1: escolher e marcar ----------
  async function etapaProdutos() {
    const titulo = (await lerTitulo()).trim();
    const descricao = textoDe(campo('descricao'));
    if (!titulo) throw Error('Abra a página de detalhes do vídeo (ou o rascunho) antes de começar — não achei o título (nem no teste A/B).');
    if (titulo.includes(' | ')) registrar('Teste A/B: usando todos os títulos — ' + titulo.slice(0, 160));
    const tags = lerTags();
    const idEp = linkEpisodio(descricao);
    let tituloEpisodio = '';
    if (idEp) {
      tituloEpisodio = await tituloDoEpisodio(idEp).catch(e => { registrar('Não consegui ler o episódio completo: ' + e.message); return ''; });
    }
    // convidado que não está na lista: procura a profissão dele na Wikipédia (sem IA)
    // fala do corte (legenda automática) → assuntos centrais
    let transcricao = '', segs = null, motivoLegenda = '';
    const idVideo = idDoVideo();
    if (idVideo) {
      registrar('Lendo a legenda do corte (pode levar até 1 minuto; não abre aba nova)…');
      try {
        let leg;
        try { leg = await obterLegendaDoStudio(idVideo); }
        catch (e1) {
          if (!e1.gerando || parar) throw e1;
          // legenda ainda sendo gerada (corte recém-enviado): sem ela os produtos ficam ruins, então pergunta se espera
          registrar('O YouTube ainda está gerando a legenda deste corte.');
          const esperar = window.confirm('O YouTube ainda está gerando a legenda automática deste corte (leva alguns minutos depois que o envio termina).\n\nSem a legenda os produtos ficam bem piores.\n\nOK = esperar a legenda (eu tento de novo a cada 30 segundos, por até 15 minutos; pode deixar a aba aberta e fazer outra coisa).\nCancelar = seguir agora só pelo título.');
          if (!esperar) throw e1;
          const t0 = Date.now();
          while (!leg) {
            if (Date.now() - t0 > 15 * 60000) throw Error('a legenda não ficou pronta em 15 minutos');
            for (let i = 30; i > 0; i -= 5) { if (parar) throw Error('parado por você'); status('Esperando a legenda do YouTube… nova tentativa em ' + i + ' s (' + mmss((Date.now() - t0) / 1000) + ' esperando)'); await espera(5000); }
            try { leg = await obterLegendaDoStudio(idVideo); }
            catch (e2) { if (!e2.gerando && !e2.tentarDeNovo) throw e2; registrar('Legenda ainda não está pronta (' + mmss((Date.now() - t0) / 1000) + ').'); }
          }
        }
        const durs0 = todos('video').map(v => v.duration).filter(n => Number.isFinite(n) && n > 0);
        const dur = durs0.length ? Math.max(...durs0) : (leg.dur || 0);
        segs = leg.segs.map((x, i, arr) => ({ ini: x.p * dur, fim: (arr[i + 1] ? arr[i + 1].p : 1) * dur, texto: x.texto }));
        transcricao = segs.map(x => x.texto).join(' ');
        registrar('Legenda lida pelo Studio: ' + segs.length + ' frases, ' + transcricao.split(' ').length + ' palavras.');
      } catch (e) {
        if (parar) throw Error('Parado por você.');
        motivoLegenda = e.message;
        registrar('Legenda pelo Studio: ' + e.message + '.');
        try { const r = await lerTranscricao(idVideo); transcricao = r.texto; registrar('Legenda lida (' + r.metodo + ').'); }
        catch (e2) { registrar('Sem legenda: ' + e2.message + '. Sigo pelo título.'); }
      }
    } else { motivoLegenda = 'não achei o código do vídeo'; registrar('Não achei o código do vídeo para ler a legenda.'); }
    ultimasFrases = segs;
    const det0 = detectar({ titulo, descricao, tags, tituloEpisodio, extras: cfg.extras, transcricao });
    const wiki = {};
    for (const c of det0.convidados.filter(c => c.desconhecido).slice(0, 2)) {
      const resumo = await resumoWikipedia(c.nome).catch(e => { registrar('Wikipédia sem resposta para ' + c.nome + ': ' + e.message); return ''; });
      if (resumo) { wiki[c.nome] = resumo; registrar('Wikipédia: ' + c.nome + ' — ' + resumo.slice(0, 110) + '…'); }
    }
    const dicas = cfg.dica.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
    const tituloComDica = dicas.length ? titulo + ' | ' + dicas.join(' ') : titulo;
    if (dicas.length) registrar('Assunto digitado: ' + dicas.join(', '));
    const det = detectar({ titulo: tituloComDica, descricao, tags, tituloEpisodio, extras: cfg.extras, wiki, transcricao, segs });
    if (det.livros && det.livros.length) registrar('Livros citados na fala: ' + det.livros.map(l => l.titulo + ' (' + mmss(l.tempo) + ')').join('; '));
    det.dicas = dicas;
    if (det.fala && det.fala.length) registrar('Mais falado no corte: ' + det.fala.join(', '));
    ultimaDeteccao = { legenda: segs ? 'lida (' + segs.length + ' frases)' : (motivoLegenda ? 'não lida — ' + motivoLegenda : ''), assuntos: (det.assuntos || []).map(a => a.buscas[0][0].replace(/^Livro /i, '') + (Number.isFinite(a.tempo) ? ' (' + mmss(a.tempo) + ')' : '')), livros: (det.livros || []).map(l => l.titulo), fala: det.fala || [], palavras: det.palavras || [], titulo, tituloEpisodio, idEpisodio: idEp, tags: tags.slice(0, 15), citados: (det.citados || []).map(c => c.nome), convidados: det.convidados.map(c => c.nome + (c.desconhecido ? ' (do episódio)' : '')), temas: det.temas.map(t => t.nome + ' (' + t.pontos + ')'), wiki: Object.fromEntries(Object.entries(wiki).map(([k, v]) => [k, v.slice(0, 160)])) };
    registrar('Citado no corte: ' + ((det.citados || []).map(c => c.nome).join(', ') || '—') + ' | Convidado: ' + (det.convidados.map(c => c.nome).join(', ') || 'não identificado') + ' | Assunto: ' + (det.temas.map(t => t.nome).join(', ') || 'não identificado'));
    mostrarDeteccao();

    det.semente = [...(idVideo || titulo)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
    if (det.assuntos && det.assuntos.length) registrar('Assuntos da fala: ' + det.assuntos.map(a => palavrasFortes(a.buscas[0][0]).slice(0, 3).join(' ') + (Number.isFinite(a.tempo) ? ' (' + mmss(a.tempo) + ')' : '')).join('; '));
    const recentes = lerRecentes();
    if (recentes.length) registrar('Produtos dos últimos cortes ficam por último (' + recentes.length + ' na lista).');
    const plano = planoDeBuscas(det, listaCoringas());
    const painel = await abrirSeletor();
    await espera(1200);
    const ja = contagemMarcados(painel);
    if (ja === null) registrar('Aviso: não consegui ler o contador de produtos marcados.');
    const jaTem = ja || 0;
    if (jaTem > 0) registrar('Este vídeo já tem ' + jaTem + ' produto(s). Vou manter e só completar.');
    // quantidade: no automático, o suficiente para cobrir o vídeo inteiro (cada produto cobre até 1 min)
    const durs = todos('video').map(v => v.duration).filter(n => Number.isFinite(n) && n > 0);
    const duracaoVideo = durs.length ? Math.max(...durs) : NaN;
    let alvo = cfg.alvo;
    if (cfg.auto && Number.isFinite(duracaoVideo)) {
      alvo = Math.min(cfg.maximo, Math.max(cfg.minimo, produtosParaCobrir(duracaoVideo)));
      registrar('Vídeo de ' + mmss(duracaoVideo) + ': para cobrir tudo precisa de ' + produtosParaCobrir(duracaoVideo) + ' produto(s); vou buscar ' + alvo + '.');
    }
    const faltam = Math.max(0, alvo - jaTem);

    const achados = []; const resumoBuscas = [];
    for (const q of plano) {
      if (parar) throw Error('Parado por você.');
      // para quando já há candidatos de sobra
      // já tem candidato de sobra: pula as listas fixas (assunto, convidado, coringa), mas sempre
      // busca o que veio da fala, do que foi citado e do título do corte
      if (!['fala', 'citado', 'titulo'].includes(q.origem) && escolher(achados, faltam, recentes).length >= faltam && achados.length >= faltam + 3) continue;
      registrar('Buscando: ' + q.busca);
      const linhas = await buscar(painel, q.busca);
      let bons = 0;
      for (const l of linhas) {
        if (l.marcado || l.indisponivel) continue;
        if (!aceita(l.nome, q)) continue;
        achados.push({ nome: l.nome, busca: q.busca, origem: q.origem, rotulo: q.rotulo, chaves: q.chaves || [], tempo: q.tempo }); bons++;
      }
      resumoBuscas.push({ busca: q.busca, resultados: linhas.length, aceitos: bons });
      registrar('  ' + q.busca + ': ' + linhas.length + ' resultado(s), ' + bons + ' servem');
      await humano();
    }
    ultimaDeteccao.buscas = resumoBuscas;
    // PRÉVIA: mostra as sugestões (as primeiras já marcadas) e espera você escolher
    const candidatos = escolher(achados, faltam + 6, recentes);
    for (const c of candidatos) if (!Number.isFinite(c.tempo)) c.tempo = momentoNaFala(segs, c.chaves);
    ultimosCandidatos = candidatos;
    etapa = 'previa';
    registrar('PRÉVIA: ' + candidatos.length + ' sugestão(ões). Escolha quais marcar.');
    mostrarSugestoes(candidatos, faltam, jaTem);
  }

  async function etapaMarcar(escolhidos, jaTem) {
    const painel = await abrirSeletor();
    await espera(600);
    registrar('Marcando ' + escolhidos.length + ' produto(s)…');
    const marcados = [];
    // agrupa por busca para buscar cada termo uma vez só
    const porBusca = new Map();
    for (const p of escolhidos) { if (!porBusca.has(p.busca)) porBusca.set(p.busca, []); porBusca.get(p.busca).push(p); }
    for (const [busca, lista] of porBusca) {
      if (parar) throw Error('Parado por você.');
      const linhas = await buscar(painel, busca);
      for (const p of lista) {
        const linha = linhas.find(l => l.nome === p.nome && !l.marcado && !l.indisponivel);
        if (!linha) { registrar('Sumiu da busca, pulei: ' + p.nome); continue; }
        const ok = await marcarUm(painel, linha);
        if (ok) { marcados.push(p); registrar('Marcado ' + (jaTem + marcados.length) + ': ' + p.nome); }
        else { registrar('O Studio não confirmou a marcação de: ' + p.nome + ' (pode ter chegado ao limite).'); break; }
      }
    }
    ultimosEscolhidos = marcados;
    guardarRecentes(marcados.map(p => p.nome));
    const total = contagemMarcados(painel);
    etapa = 'conferir-produtos';
    const pouco = (total ?? 0) < cfg.minimo;
    registrar('PARADA PARA CONFERÊNCIA: ' + (total ?? '?') + ' produto(s) marcado(s).' + (pouco ? ' Ficou abaixo do mínimo (' + cfg.minimo + ').' : ''));
    mostrarConferencia(total, marcados, pouco);
  }

  // ---------- etapa 2: tempos ----------
  // Linhas do editor de tempos. No Studio de verdade, depois de adicionar um tempo o botão "+"
  // fica desativado com o texto "Marcação de tempo já adicionada", e o horário nem sempre aparece
  // escrito na linha — por isso "marcado" olha as três coisas.
  function linhasDeTempo(painel) {
    const botoes = [...new Set(todos('#add-timestamp-button', painel))].filter(b => b.isConnected);
    const seg = s => s.split(':').reduce((n, p) => n * 60 + Number(p), 0);
    return botoes.map((add, i) => {
      let escopo = null;
      for (let s = pai(add); s && s !== painel && dentro(painel, s); s = pai(s)) {
        if (todos('#add-timestamp-button', s).length !== 1) break;
        escopo = s;
      }
      const bruto = ((escopo || add).innerText || (escopo || add).textContent || '');
      const linhasTxt = bruto.split(/\n+/).map(x => x.trim()).filter(Boolean);
      const nome = (linhasTxt.find(x => !/^\+$/.test(x) && !/^\d+:\d{2}/.test(x)) || '').replace(/\s*\+$/, '').slice(0, 140);
      const texto = bruto.replace(/\s+/g, ' ');
      const m = [...texto.matchAll(/(\d+:\d{2}(?::\d{2})?)\s*[-–]\s*(\d+:\d{2}(?::\d{2})?)/g)];
      const rotulo = (add.getAttribute('aria-label') || add.getAttribute('title') || '');
      const intervalo = m.length ? { inicio: seg(m[0][1]), fim: seg(m[0][2]) } : null;
      const marcado = !!intervalo || /j[aá] adicionad/i.test(rotulo) || !habilitado(add);
      return { i, add, escopo, nome, intervalo, marcado };
    });
  }

  async function etapaTempos() {
    let p = painelProdutos();
    if (!p) throw Error('A janela de produtos fechou. Abra de novo e clique em "Começar".');
    if (p.tipo === 'seletor') {
      const total = contagemMarcados(p.el);
      if (!total) throw Error('Nenhum produto marcado para pôr tempo.');
      const avancar = umVisivel(todos('#picker-next-button', p.el));
      if (!habilitado(avancar)) throw Error('O botão "Avançar" não está disponível.');
      avancar.click();
      for (let i = 0; i < 60; i++) { await espera(250); p = painelProdutos(); if (p?.tipo === 'tempos') break; }
      if (p?.tipo !== 'tempos') throw Error('O Studio não abriu "Adicionar marcações de tempo".');
    }
    const painel = p.el;
    // espera carregar linhas, cursor e vídeo
    let linhas = [], cursor = null, cabeca = null, duracao = NaN;
    for (let i = 0; i < 75; i++) {
      linhas = linhasDeTempo(painel);
      cursor = umVisivel(todos('ytcp-media-timestamp-input input', painel));
      cabeca = umVisivel(todos('ytve-playhead#playhead[role="slider"], ytve-playhead[role="slider"]', painel));
      const dur = todos('video', painel).map(v => v.duration).filter(n => Number.isFinite(n) && n > 0);
      duracao = dur.length ? Math.max(...dur) : NaN;
      if (linhas.length && cursor && Number.isFinite(duracao)) break;
      await espera(200);
    }
    if (!linhas.length) throw Error('Não achei as linhas de produto no editor de tempos.');
    if (!cursor) throw Error('Não achei o campo de horário (cursor) do editor de tempos.');
    if (!Number.isFinite(duracao)) throw Error('Não consegui ler a duração do vídeo no editor de tempos.');
    for (const v of todos('video', painel)) try { v.pause(); } catch {}

    // linhas que já têm tempo são puladas (dá para continuar de onde parou).
    const nomes = linhas.map(l => l.nome);
    const porNome = new Set(nomes).size === nomes.length && nomes.every(Boolean);
    const acharLinha = (k) => { const ls = linhasDeTempo(painel); return porNome ? ls.find(l => l.nome === nomes[k]) : ls[k]; };
    if (linhas.every(l => l.marcado)) { etapa = 'conferir-tempos'; registrar('Todos os produtos já têm tempo.'); mostrarFinal(); return; }
    // momento falado de cada produto (vem da prévia); linha ↔ produto pelo começo do nome
    const chaveNome = n => norm(n).slice(0, 28);
    const prefs = nomes.map(n => {
      const p = ultimosEscolhidos.find(x => chaveNome(x.nome) && (chaveNome(n).startsWith(chaveNome(x.nome)) || chaveNome(x.nome).startsWith(chaveNome(n))));
      return p && Number.isFinite(p.tempo) ? p.tempo : null;
    });
    const plano = planoPorFala(duracao, prefs);
    const comMomento = prefs.filter(Number.isFinite).length;
    registrar(comMomento ? comMomento + ' produto(s) começam no segundo em que são falados; os outros tapam os buracos que sobram.' : 'Nenhum produto tem momento na fala: os tempos ficam espalhados pelo vídeo.');
    const jaTinham = linhas.filter(l => l.marcado).length;
    registrar('Duração ' + mmss(duracao) + ' — ' + linhas.length + ' tempos planejados' + (jaTinham ? ' (' + jaTinham + ' já tinham tempo, vou pular)' : '') + '.');
    const cob = cobertura(plano, duracao);
    ultimaCobertura = cob;
    registrar(cob.faltaProdutos ? 'Atenção: ' + linhas.length + ' produtos cobrem ' + mmss(cob.coberto) + ' de ' + mmss(cob.total) + '. Para não sobrar buraco, faltam ' + cob.faltaProdutos + ' produto(s).' : 'Os tempos cobrem o vídeo todo, sem buraco.');

    // de trás para frente: o Studio corta um intervalo novo no começo do próximo
    for (let k = plano.length - 1; k >= 0; k--) {
      if (parar) throw Error('Parado por você.');
      const passo = plano[k];
      const lk = passo.linha;
      let linha = acharLinha(lk);
      if (!linha) throw Error('Não achei mais a linha do produto ' + (lk + 1) + ' (' + (nomes[lk] || '?') + ').');
      if (linha.marcado) { registrar('Já tinha tempo, pulei: ' + linha.nome.slice(0, 60)); continue; }
      const valor = Math.floor(passo.inicio / 60) + ':' + String(passo.inicio % 60).padStart(2, '0') + ':00';
      cursor.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(cursor, valor);
      cursor.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      for (const tipo of ['keydown', 'keyup']) cursor.dispatchEvent(new KeyboardEvent(tipo, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      cursor.dispatchEvent(new Event('change', { bubbles: true })); cursor.blur();
      let posicionou = false;
      for (let i = 0; i < 30; i++) {
        await espera(100);
        const m = /^(\d+):([0-5]\d):(\d+)$/.exec((cabeca?.textContent || '').trim());
        if (m && Number(m[1]) * 60 + Number(m[2]) === passo.inicio) { posicionou = true; break; }
        if (!cabeca) { posicionou = true; break; }
      }
      if (!posicionou) throw Error('O Studio não moveu o cursor para ' + mmss(passo.inicio) + '. Nenhum tempo foi colocado nesse ponto.');
      linha = acharLinha(lk);
      if (!linha || linha.marcado) throw Error('A linha do produto ' + (lk + 1) + ' mudou durante a operação.');
      linha.add.scrollIntoView({ block: 'center' });
      await humano();
      linha.add.click();
      let feito = null;
      for (let i = 0; i < 40; i++) { await espera(100); const l = acharLinha(lk); if (l && l.marcado) { feito = l; break; } }
      if (!feito) throw Error('O Studio não confirmou o tempo de: ' + linha.nome + '. Não repeti o clique.');
      const iv = feito.intervalo;
      registrar('Tempo ' + (k + 1) + ': ' + (iv ? mmss(iv.inicio) + '–' + mmss(iv.fim) : 'a partir de ' + mmss(passo.inicio)) + ' — ' + linha.nome.slice(0, 60) + (Number.isFinite(prefs[lk]) ? ' (falado em ' + mmss(prefs[lk]) + ')' : ''));
    }
    etapa = 'conferir-tempos';
    registrar('PARADA PARA CONFERÊNCIA: tempos colocados. Confira e clique em "Pronto" no Studio.');
    mostrarFinal();
  }

  function pedirJSON(url) {
    return new Promise((ok, erro) => GM_xmlhttpRequest({
      method: 'GET', url, timeout: 8000,
      onload: r => { try { ok(JSON.parse(r.responseText)); } catch { erro(Error('resposta inválida (' + r.status + ')')); } },
      onerror: () => erro(Error('sem conexão')), ontimeout: () => erro(Error('demorou demais')),
    }));
  }

  async function resumoWikipedia(nome) {
    const chave = 'wiki:' + norm(nome);
    const cache = GM_getValue(chave, null);
    if (cache !== null) return ehPessoa(cache) ? cache : '';
    const base = 'https://pt.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=extracts&exintro=1&explaintext=1&exchars=600&titles=';
    const extrato = async titulo => {
      const j = await pedirJSON(base + encodeURIComponent(titulo));
      const pag = Object.values(j?.query?.pages || {})[0];
      return pag && !('missing' in pag) && pag.extract && !/pode referir-se a|desambigua/i.test(pag.extract) ? pag.extract : '';
    };
    let texto = await extrato(nome);
    if (!texto) {
      const j = await pedirJSON('https://pt.wikipedia.org/w/api.php?action=query&format=json&list=search&srlimit=3&srsearch=' + encodeURIComponent(nome));
      const achado = (j?.query?.search || []).find(r => tem(r.title, norm(nome)));
      if (achado) texto = await extrato(achado.title);
    }
    // só vale se a página for de uma PESSOA (ano de nascimento entre parênteses ou "é um(a) ... brasileiro(a)").
    // Evita xará: "Rubão" na Wikipédia é uma música, não o convidado.
    if (texto && !ehPessoa(texto)) texto = '';
    GM_setValue(chave, texto || '');
    return texto || '';
  }

  async function tituloDoEpisodio(id) {
    const cache = GM_getValue('ep:' + id, '');
    if (cache) return cache;
    try { const t = await tituloOEmbed(id); if (t) return t; } catch (e) { registrar('oEmbed falhou (' + e.message + '), tentando a página do vídeo…'); }
    // plano B: lê o título direto da página pública do vídeo
    const html = await new Promise((ok, erro) => GM_xmlhttpRequest({
      method: 'GET', timeout: 10000, url: 'https://www.youtube.com/watch?v=' + id + '&hl=pt-BR',
      onload: r => ok(r.responseText || ''), onerror: () => erro(Error('sem conexão')), ontimeout: () => erro(Error('demorou demais')),
    }));
    const m = html.match(/<meta\s+(?:property|name)="og:title"\s+content="([^"]+)"/i) || html.match(/<title>([^<]+?)(?:\s*-\s*YouTube)?<\/title>/i);
    const t = m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim() : '';
    if (!t || /^youtube$/i.test(t)) throw Error('não achei o título do episódio');
    GM_setValue('ep:' + id, t);
    return t;
  }

  // LEGENDA AUTOMÁTICA do vídeo (para descobrir o assunto pela fala): a faixa pública de legenda
  // que a página do vídeo indica. Em 11/2026 o YouTube devolve essa faixa vazia para scripts na
  // maioria dos vídeos; quando vier vazia, o script segue pelo título e pelo campo "Assunto".
  function pedirTexto(url, opcoes = {}) {
    return new Promise((ok, erro) => GM_xmlhttpRequest({
      method: opcoes.method || 'GET', url, timeout: 12000, headers: opcoes.headers, data: opcoes.data,
      onload: r => ok({ status: r.status, texto: r.responseText || '' }), onerror: () => erro(Error('sem conexão')), ontimeout: () => erro(Error('demorou demais')),
    }));
  }
  function jsonDepois(html, marcador) {
    const i = html.indexOf(marcador); if (i < 0) return null;
    const ini = html.indexOf('{', i); if (ini < 0) return null;
    let nivel = 0, dentroStr = false, esc = false;
    for (let k = ini; k < html.length; k++) {
      const c = html[k];
      if (dentroStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') dentroStr = false; continue; }
      if (c === '"') dentroStr = true; else if (c === '{') nivel++; else if (c === '}') { nivel--; if (!nivel) { try { return JSON.parse(html.slice(ini, k + 1)); } catch { return null; } } }
    }
    return null;
  }
  function coletar(o, chave, out = []) {
    if (Array.isArray(o)) o.forEach(v => coletar(v, chave, out));
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === chave) out.push(v); coletar(v, chave, out); }
    return out;
  }
  async function lerTranscricao(id) {
    const cache = GM_getValue('fala:' + id, '');
    if (cache) return { texto: cache, metodo: 'guardada' };
    const pagina = await pedirTexto('https://www.youtube.com/watch?v=' + id + '&hl=pt-BR');
    const html = pagina.texto;
    // 1) faixa de legenda
    const pr = jsonDepois(html, 'ytInitialPlayerResponse');
    const faixas = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const faixa = faixas.find(f => /^pt/.test(f.languageCode) && f.kind !== 'asr') || faixas.find(f => /^pt/.test(f.languageCode)) || faixas[0];
    let texto = '', metodo = '';
    if (faixa?.baseUrl) {
      try {
        const r = await pedirTexto(faixa.baseUrl + '&fmt=json3');
        const j = JSON.parse(r.texto || '{}');
        texto = (j.events || []).flatMap(e => (e.segs || []).map(x => x.utf8 || '')).join(' ').replace(/\s+/g, ' ').trim();
        if (texto) metodo = 'faixa de legenda (' + (faixa.languageCode || '?') + (faixa.kind === 'asr' ? ', automática' : '') + ')';
      } catch {}
    }
    if (!texto) throw Error(faixas.length ? 'o YouTube não libera o texto da legenda para scripts' : 'o vídeo ainda não tem legenda (página ' + pagina.status + ')');
    GM_setValue('fala:' + id, texto.slice(0, 60000));
    return { texto, metodo };
  }
  // ===== LEGENDA PELO STUDIO =====
  // Na página "Legendas" do Studio, quem gerencia o canal vê a legenda automática com o tempo de
  // cada frase. O script abre essa página num quadro invisível, lê as frases e apaga o quadro.
  // NUNCA clica em "Salvar rascunho" nem em "Publicar".
  const segTempo = t => { const p = String(t).split(':').map(Number); return p.length === 3 ? p[0] * 60 + p[1] + p[2] / 30 : p.length === 2 ? p[0] * 60 + p[1] : NaN; };
  // Lê a legenda dentro de uma página do Studio (doc/win de um quadro invisível).
  async function lerLegendaNoQuadro(doc, win) {
    const ate = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (parar) throw Error('parado por você'); const r = fn(); if (r) return r; await espera(400); } return null; };
    const tq = sel => raizes(doc).flatMap(r => [...r.querySelectorAll(sel)]);
    const vis = el => !!el && el.getClientRects().length > 0 && win.getComputedStyle(el).visibility !== 'hidden';
    const btnTexto = re => tq('ytcp-button, button, tp-yt-paper-button').filter(vis).find(b => re.test((b.textContent || '').trim()));
    const textoPagina = () => ((doc.body && doc.body.innerText) || '').replace(/\s+/g, ' ');
    const erroGerando = () => { const e = Error('o YouTube ainda está gerando a legenda automática deste corte'); e.gerando = true; return e; };
    const ehGerando = () => /Gerando legendas autom|Generating automatic|depois que as legendas forem geradas|after (the )?(subtitles|captions) are generated|Processando|Processing|Enviando v|Uploading/i.test(textoPagina());
    const editar = await ate(() => btnTexto(/^Editar legendas$/i) || btnTexto(/^Edit subtitles$/i) || (ehGerando() ? 'gerando' : null), 35000);
    if (editar === 'gerando' || (editar && ehGerando())) throw erroGerando();
    if (!editar) {
      const txt = textoPagina();
      if (/Algo deu errado|Something went wrong/i.test(txt)) { const e = Error('a página de legendas deu erro ("Algo deu errado")'); e.tentarDeNovo = true; throw e; }
      if (/Adicionar legenda|Add subtitles|Adicionar idioma|Add language/i.test(txt)) throw Error('o vídeo ainda não tem legenda automática (o YouTube demora um pouco depois do envio)');
      const erro = txt.match(/(Ocorreu um erro|Algo deu errado|erro|não encontrad)[^.]{0,80}/i);
      throw Error('não achei o botão "Editar legendas"' + (erro ? ' — a página disse: ' + erro[0] : ''));
    }
    editar.click();
    // o editor abre com a transcrição inteira numa caixa de texto (com pontuação). Só lê; nada é salvo.
    const caixa = await ate(() => { const t = tq('textarea').sort((x, y) => y.value.length - x.value.length)[0]; return t && t.value.length > 200 ? t : null; }, 40000);
    if (!caixa) { if (ehGerando()) throw erroGerando(); const e = Error('a legenda veio vazia (o YouTube pode ainda estar gerando a legenda automática)'); e.gerando = true; throw e; }
    await espera(800);
    const texto = caixa.value.replace(/\s+/g, ' ').trim();
    const dur = (await ate(() => { const d = tq('video').map(v => v.duration).filter(n => Number.isFinite(n) && n > 0); return d.length ? Math.max(...d) : null; }, 8000)) || 0;
    // frases com a posição relativa no texto (vira minuto proporcional ao tamanho da fala)
    const frases = texto.split(/(?<=[.!?…])\s+/).filter(Boolean);
    const segs = []; let pos = 0;
    for (const f of frases) { segs.push({ p: pos / texto.length, texto: f }); pos += f.length + 1; }
    return { ok: true, segs, dur };
  }
  // Abre a página Legendas do vídeo num quadro invisível DENTRO desta mesma aba (nenhuma aba nova),
  // lê o texto e apaga o quadro. NUNCA clica em "Salvar", "Publicar" ou "Pronto".
  async function obterLegendaDoStudio(id) {
    try { return await obterLegendaUmaVez(id); }
    catch (e) { if (e.tentarDeNovo && !parar) { await espera(3000); return await obterLegendaUmaVez(id); } throw e; }
  }
  async function obterLegendaUmaVez(id) {
    const guardada = GM_getValue('legenda:' + id, '');
    if (guardada) { try { const j = JSON.parse(guardada); if (j.ok && j.segs?.length) return j; } catch {} }
    const q = document.createElement('iframe');
    q.setAttribute('aria-hidden', 'true'); q.tabIndex = -1;
    q.style.cssText = 'position:fixed;left:-4000px;top:0;width:1280px;height:900px;opacity:0;pointer-events:none;border:0;';
    q.src = '/video/' + id + '/translations';
    document.body.appendChild(q);
    try {
      const t0 = Date.now();
      while (!(q.contentDocument && q.contentDocument.body && /\/translations/.test(q.contentWindow.location.pathname))) {
        if (parar) throw Error('parado por você');
        if (Date.now() - t0 > 30000) throw Error('a página de legendas não abriu');
        await espera(500);
      }
      const r = await lerLegendaNoQuadro(q.contentDocument, q.contentWindow);
      GM_setValue('legenda:' + id, JSON.stringify({ ...r, t: Date.now() }));
      return r;
    } finally { try { q.remove(); } catch {} }
  }

  // Lista dos produtos marcados nos últimos cortes (neste navegador), para variar de um corte para outro.
  function lerRecentes() { try { return JSON.parse(GM_getValue('recentes', '[]')).map(x => x.n).slice(0, 60); } catch { return []; } }
  function guardarRecentes(nomes) {
    let lista = []; try { lista = JSON.parse(GM_getValue('recentes', '[]')); } catch {}
    lista = [...nomes.map(n => ({ n, t: Date.now() })), ...lista.filter(x => !nomes.some(n => repetido(n, x.n)))].slice(0, 60);
    GM_setValue('recentes', JSON.stringify(lista));
  }
  function idDoVideo() {
    const m = location.href.match(/\/video\/([A-Za-z0-9_-]{11})/) || location.href.match(/[?&]udvid=([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    const a = todos('a[href*="youtu.be/"], a[href*="watch?v="]').map(x => (x.href.match(/(?:youtu\.be\/|v=)([A-Za-z0-9_-]{11})/) || [])[1]).find(Boolean);
    return a || null;
  }

  function tituloOEmbed(id) {
    return new Promise((ok, erro) => {
      GM_xmlhttpRequest({
        method: 'GET', timeout: 8000,
        url: 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id),
        onload: r => { try { const t = JSON.parse(r.responseText).title || ''; if (t) GM_setValue('ep:' + id, t); ok(t); } catch (e) { erro(Error('código ' + r.status)); } },
        onerror: () => erro(Error('sem conexão')), ontimeout: () => erro(Error('demorou demais')),
      });
    });
  }

  // ====================================================================================
  //  PAINEL (botão flutuante)
  // ====================================================================================
  const CSS = `
  #pf-botao{position:fixed;right:18px;bottom:18px;z-index:2147483646;background:#ff4e45;color:#fff;border:0;border-radius:24px;padding:10px 16px;font:600 14px Roboto,Arial,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.35);cursor:pointer}
  #pf-botao:hover{filter:brightness(1.1)}
  #pf-painel{position:fixed;right:18px;bottom:70px;z-index:2147483647;width:380px;max-height:78vh;overflow:auto;background:#1f1f1f;color:#eee;border:1px solid #3a3a3a;border-radius:12px;font:13px/1.45 Roboto,Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);display:none}
  #pf-painel.aberto{display:block}
  #pf-painel header{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid #333;font-weight:700;font-size:14px}
  #pf-painel header small{color:#999;font-weight:400}
  #pf-painel section{padding:10px 14px;border-bottom:1px solid #2c2c2c}
  #pf-painel h4{margin:0 0 6px;font-size:12px;color:#aaa;text-transform:uppercase;letter-spacing:.04em}
  #pf-painel button.pf{background:#3ea6ff;color:#0f0f0f;border:0;border-radius:18px;padding:7px 14px;font-weight:600;cursor:pointer;margin:4px 6px 0 0}
  #pf-painel button.pf.sec{background:#333;color:#eee}
  #pf-painel button.pf.perigo{background:#ff6b6b}
  #pf-painel button.pf:disabled{opacity:.5;cursor:default}
  #pf-status{color:#ffd166;min-height:18px}
  #pf-lista{margin:6px 0 0;padding-left:18px}
  #pf-lista li{margin:2px 0}
  .pf-tag{display:inline-block;background:#2d2d2d;border-radius:10px;padding:1px 8px;margin:2px 4px 2px 0}
  .pf-alerta{background:#3a2a10;border:1px solid #7a5a20;border-radius:8px;padding:8px;margin-top:6px}
  .pf-ok{background:#11301c;border:1px solid #1f6b3a;border-radius:8px;padding:8px;margin-top:6px}
  #pf-painel label{display:inline-flex;align-items:center;gap:6px;margin-right:12px}
  #pf-painel input[type=number]{width:52px;background:#111;color:#eee;border:1px solid #444;border-radius:6px;padding:3px}
  #pf-painel textarea{width:100%;height:70px;background:#111;color:#eee;border:1px solid #444;border-radius:6px;font:12px monospace}
  #pf-log{max-height:150px;overflow:auto;font:11px monospace;color:#bbb;white-space:pre-wrap}
  `;

  // O YouTube Studio bloqueia innerHTML ("Trusted Types"), então tudo é montado peça por peça.
  function el(tag, attrs = {}, ...filhos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'onclick') e.onclick = v;
      else if (k === 'texto') e.textContent = v;
      else if (k === 'style') e.style.cssText = v;
      else e.setAttribute(k, v);
    }
    for (const f of filhos) if (f !== null && f !== undefined && f !== false) e.append(f);
    return e;
  }
  // O Studio às vezes não deixa digitar em campos de fora dele (prende o foco na janela de produtos
  // ou intercepta o teclado). Por isso, clicar num campo do painel abre uma janelinha do próprio
  // navegador para digitar — essa funciona sempre.
  function campoDigitavel(campo, titulo, aoMudar, multilinha = false) {
    const sep = typeof multilinha === 'string' ? multilinha : ';';
    const abrir = (ev) => {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      const atual = multilinha ? campo.value.split(/\r?\n/).filter(Boolean).join(' ' + sep + ' ') : campo.value;
      const r = window.prompt(titulo + (multilinha ? '\n(separe os itens com ' + sep + ')' : ''), atual);
      if (r === null) return;
      campo.value = multilinha ? r.split(sep).map(x => x.trim()).filter(Boolean).join('\n') : r.trim();
      aoMudar && aoMudar(campo.value);
    };
    campo.readOnly = true;
    campo.style.cursor = 'pointer';
    campo.title = 'Clique para digitar';
    campo.addEventListener('mousedown', abrir);
    campo.addEventListener('focus', () => campo.blur());
    return campo;
  }
  const limpar = box => { while (box.firstChild) box.removeChild(box.firstChild); return box; };
  const cinza = (...f) => el('div', { style: 'color:#999;margin-top:4px' }, ...f);

  function montar() {
    if (document.getElementById('pf-botao')) return;
    const estilo = document.createElement('style'); estilo.textContent = CSS;
    (document.head || document.documentElement).append(estilo);
    const botao = el('button', { id: 'pf-botao', title: 'Produtos Flow' }, '🛒 Produtos Flow');
    botao.onclick = () => document.getElementById('pf-painel').classList.toggle('aberto');
    const fechar = el('button', { class: 'pf sec', id: 'pf-fechar', style: 'margin:0' }, '✕');
    const alvo = el('input', { type: 'number', id: 'pf-alvo', min: '1', max: '30' }); alvo.value = cfg.alvo;
    const autoCx = el('input', { type: 'checkbox', id: 'pf-auto' }); autoCx.checked = cfg.auto;
    const dica = el('input', { type: 'text', id: 'pf-dica', placeholder: 'palavras separadas por vírgula', style: 'width:100%;background:#111;color:#eee;border:1px solid #444;border-radius:6px;padding:4px;margin-top:3px' });
    campoDigitavel(dica, 'Assunto do corte (palavras separadas por vírgula):', v => { cfg.dica = v; });
    const numero = (input, nome, chave, padrao) => campoDigitavel(input, nome + ' (número):', v => { const n = Math.max(1, Math.min(30, Number(v) || padrao)); input.value = n; cfg[chave] = n; GM_setValue(chave, n); });
    const maximo = el('input', { type: 'number', id: 'pf-max', min: '1', max: '30' }); maximo.value = cfg.maximo;
    const minimo = el('input', { type: 'number', id: 'pf-min', min: '1', max: '30' }); minimo.value = cfg.minimo;
    const extras = el('textarea', { id: 'pf-extras' }); extras.value = cfg.extras;
    campoDigitavel(extras, 'Convidados extras. Formato: Nome = busca 1; busca 2', v => { cfg.extras = v; GM_setValue('extras', v); status('Convidados extras guardados (' + lerExtras(v).length + ').'); }, '|');
    const salvarExtras = el('button', { class: 'pf sec', id: 'pf-salvar-extras' }, 'Guardar convidados extras');
    const coringas = el('textarea', { id: 'pf-coringas' }); coringas.value = cfg.coringas;
    campoDigitavel(coringas, 'Itens coringa (uma busca por item):', v => { cfg.coringas = v; GM_setValue('coringas', v); status('Itens coringa guardados (' + listaCoringas().length + ').'); }, true);
    const salvarCoringas = el('button', { class: 'pf sec' }, 'Guardar itens coringa');
    const copiar = el('button', { class: 'pf sec', id: 'pf-copiar' }, '📋 Copiar relatório (para mandar ao Claude)');
    const painel = el('div', { id: 'pf-painel' },
      el('header', {}, el('span', {}, '🛒 Produtos Flow ', el('small', {}, 'v' + VERSAO)), fechar),
      el('section', {},
        el('div', { id: 'pf-status' }, 'Abra o vídeo (detalhes) ou o rascunho e clique em Começar.'),
        el('label', { style: 'display:block;margin-top:8px' }, 'Assunto do corte (opcional): ', dica),
        el('div', { style: 'color:#888;font-size:11px' }, 'Ex.: vício, felicidade · STF · drift, Japão. Vem antes de tudo na busca.'),
        el('div', { id: 'pf-acoes' })),
      el('section', { id: 'pf-det', style: 'display:none' }),
      el('section', { id: 'pf-conf', style: 'display:none' }),
      el('section', { id: 'pf-aviso', style: 'display:none' }),
      el('section', {},
        el('h4', {}, 'Ajustes'),
        el('label', {}, autoCx, ' Automático (cobrir o vídeo todo)'), el('br'),
        el('label', {}, 'Quantos (manual) ', alvo),
        el('label', {}, 'Máximo ', maximo),
        el('label', {}, 'Mínimo ', minimo),
        el('details', { style: 'margin-top:8px' },
          el('summary', {}, 'Convidados extras (sem mexer no código)'),
          el('div', { style: 'color:#aaa;margin:4px 0' }, 'Uma linha por convidado: ', el('code', {}, 'Nome = busca 1; busca 2'), el('br'), 'Ex.: ', el('code', {}, 'Edu Falaschi = Angra vinil; corda guitarra')),
          extras, salvarExtras),
        el('details', { style: 'margin-top:8px' },
          el('summary', {}, 'Itens coringa (quando não achar produto do assunto)'),
          el('div', { style: 'color:#aaa;margin:4px 0' }, 'Uma busca por linha. Entram por último, só para completar a quantidade.'),
          coringas, salvarCoringas)),
      el('section', {}, el('h4', {}, 'Registro'), el('div', { id: 'pf-log' }), copiar));
    document.body.append(botao, painel);
    numero(alvo, 'Quantos produtos (manual)', 'alvo', 10);
    numero(minimo, 'Mínimo de produtos', 'minimo', 5);
    numero(maximo, 'Máximo de produtos', 'maximo', 10);
    // não deixa o teclado do painel acionar atalhos do Studio
    for (const tipo of ['keydown', 'keyup', 'keypress']) painel.addEventListener(tipo, e => e.stopPropagation());
    fechar.onclick = () => painel.classList.remove('aberto');
    autoCx.onchange = () => { cfg.auto = autoCx.checked; GM_setValue('auto', cfg.auto); };
    maximo.onchange = e => { cfg.maximo = Math.max(1, Math.min(30, Number(e.target.value) || 10)); GM_setValue('maximo', cfg.maximo); };
    alvo.onchange = e => { cfg.alvo = Math.max(1, Math.min(30, Number(e.target.value) || 10)); GM_setValue('alvo', cfg.alvo); };
    minimo.onchange = e => { cfg.minimo = Math.max(1, Math.min(30, Number(e.target.value) || 5)); GM_setValue('minimo', cfg.minimo); };
    salvarExtras.onclick = () => { cfg.extras = extras.value; GM_setValue('extras', cfg.extras); status('Convidados extras guardados (' + lerExtras(cfg.extras).length + ').'); };
    salvarCoringas.onclick = () => { cfg.coringas = coringas.value; GM_setValue('coringas', cfg.coringas); status('Itens coringa guardados (' + listaCoringas().length + ').'); };
    copiar.onclick = copiarRelatorio;
    acoesInicio();
  }

  function status(msg) {
    const s = document.getElementById('pf-status'); if (s) s.textContent = msg;
    const l = document.getElementById('pf-log'); if (l) { l.textContent = log.map(x => x.t + '  ' + x.msg).join('\n'); l.scrollTop = l.scrollHeight; }
  }
  function acoes(...botoes) { const a = document.getElementById('pf-acoes'); limpar(a); a.append(...botoes); }
  const btn = (txt, fn, classe = '') => el('button', { class: 'pf ' + classe, onclick: fn }, txt);

  function acoesInicio() {
    acoes(btn('▶ Começar', () => rodar(etapaProdutos)));
    document.getElementById('pf-conf').style.display = 'none';
  }
  function acoesRodando() { acoes(btn('■ Parar', () => { parar = true; status('Parando…'); }, 'perigo')); }

  const etiquetas = lista => lista.map(c => el('span', { class: 'pf-tag' }, c));

  function mostrarDeteccao() {
    const d = ultimaDeteccao, box = limpar(document.getElementById('pf-det'));
    box.style.display = 'block';
    box.append(...[
      el('h4', {}, 'O que eu entendi do vídeo'),
      d.citados && d.citados.length ? el('div', {}, el('b', {}, 'Citado no corte: '), ...etiquetas(d.citados)) : null,
      el('div', {}, el('b', {}, 'Convidado: '), ...(d.convidados.length ? etiquetas(d.convidados) : [el('i', {}, 'não identificado')])),
      el('div', {}, el('b', {}, 'Assunto: '), ...(d.temas.length ? etiquetas(d.temas) : [el('i', {}, 'não identificado')])),
      el('div', {}, el('b', {}, 'Legenda do corte: '), d.legenda ? el('span', {}, d.legenda) : el('i', {}, 'não lida')),
      d.assuntos && d.assuntos.length ? el('div', {}, el('b', {}, 'Assuntos da fala: '), ...etiquetas(d.assuntos)) : null,
      d.livros && d.livros.length ? el('div', {}, el('b', {}, 'Livros citados: '), ...etiquetas(d.livros)) : null,
      d.fala && d.fala.length ? el('div', {}, el('b', {}, 'Mais falado no corte: '), ...etiquetas(d.fala)) : null,
      d.palavras && d.palavras.length ? el('div', {}, el('b', {}, 'Palavras usadas na busca: '), ...etiquetas(d.palavras)) : null,
      d.tituloEpisodio ? cinza('Episódio completo: ' + d.tituloEpisodio) : null,
      ...Object.entries(d.wiki || {}).map(([k, v]) => cinza('Wikipédia (' + k + '): ' + v.slice(0, 140) + '…'))].filter(Boolean));
  }

  const ROTULO_ORIGEM = { fala: 'assunto falado no corte', citado: 'citado no corte', tema: 'assunto do corte', titulo: 'palavra do corte (título/fala)', convidado: 'convidado', 'tema-ep': 'assunto do episódio', coringa: 'coringa' };

  function mostrarSugestoes(candidatos, faltam, jaTem) {
    const box = limpar(document.getElementById('pf-conf'));
    box.style.display = 'block';
    const caixas = candidatos.map((p, i) => {
      const c = el('input', { type: 'checkbox' }); c.checked = i < faltam;
      return { p, c };
    });
    const contador = el('b', {}, '');
    const atualizar = () => { contador.textContent = caixas.filter(x => x.c.checked).length + ' escolhido(s)'; };
    caixas.forEach(x => x.c.onchange = atualizar); atualizar();
    box.append(...[
      el('h4', {}, '👀 Prévia — escolha os produtos'),
      candidatos.length ? null : el('div', { class: 'pf-alerta' }, 'Não achei nenhum produto que combine. Use os itens coringa (Ajustes) ou marque à mão.'),
      el('div', { style: 'color:#aaa;margin-bottom:4px' }, 'Nada foi marcado ainda. Desmarque o que não combina e marque os extras que quiser. ', contador),
      el('div', { style: 'max-height:260px;overflow:auto' }, ...caixas.map(({ p, c }) =>
        el('label', { style: 'display:flex;gap:6px;align-items:flex-start;margin:3px 0' }, c,
          el('span', {}, p.nome, el('br'), el('span', { style: 'color:#888;font-size:11px' }, (p.rotulo === 'livro citado na fala' ? 'livro citado na fala' : ROTULO_ORIGEM[p.origem]) + ' · busca "' + p.busca + '"' + (Number.isFinite(p.tempo) ? ' · falado em ' + mmss(p.tempo) : '') + (p.recente ? ' · já usado num corte recente' : ''))))))].filter(Boolean));
    acoes(btn('✔ Marcar os escolhidos', () => {
      const lista = caixas.filter(x => x.c.checked).map(x => x.p);
      if (!lista.length) { status('Escolha pelo menos um produto.'); return; }
      rodar(() => etapaMarcar(lista, jaTem));
    }), btn('Cancelar', () => { etapa = 'inicio'; acoesInicio(); status('Cancelado. Nada foi marcado.'); }, 'sec'), btnAvisar());
  }

  // Botão de avisar: abre um relatório no GitHub do script (o Claude lê de lá) e copia o relatório completo.
  const btnAvisar = () => btn('📨 Avisar o Claude do que ficou errado', abrirAviso, 'sec');
  function abrirAviso() {
    const box = document.getElementById('pf-aviso'); limpar(box); box.style.display = 'block';
    const lista = (ultimosEscolhidos.length ? ultimosEscolhidos : ultimosCandidatos).slice(0, 16);
    const caixas = lista.map(p => ({ p, c: el('input', { type: 'checkbox' }) }));
    const texto = el('textarea', { placeholder: 'Clique aqui para escrever o que ficou errado…' });
    campoDigitavel(texto, 'O que ficou errado? (ex.: o assunto era STF e veio livro de economia)', null);
    box.append(...[
      el('h4', {}, '📨 O que ficou errado?'),
      texto,
      lista.length ? el('div', { style: 'color:#aaa;margin:6px 0 2px' }, 'Marque os produtos que NÃO combinam:') : null,
      ...caixas.map(({ p, c }) => el('label', { style: 'display:flex;gap:6px;margin:2px 0' }, c, el('span', {}, p.nome))),
      el('div', { style: 'color:#aaa;margin-top:6px' }, 'Abre uma página do GitHub já preenchida: é só clicar em "Create" / "Submit new issue". Depois diga ao Claude: "olha os avisos".'),
      btn('Enviar aviso (abre o GitHub)', () => {
        const errados = caixas.filter(x => x.c.checked).map(x => x.p);
        enviarAviso(texto.value.trim(), errados);
      }),
      btn('Fechar', () => { box.style.display = 'none'; }, 'sec')].filter(Boolean));
  }
  function enviarAviso(texto, errados) {
    const d = ultimaDeteccao || {};
    const linhas = [
      '**O que ficou errado:** ' + (texto || '(sem comentário)'),
      '',
      errados.length ? '**Produtos que não combinam:**\n' + errados.map(p => '- ' + p.nome + ' _(busca "' + p.busca + '", ' + (ROTULO_ORIGEM[p.origem] || p.origem) + ')_').join('\n') : '',
      '',
      '**Vídeo:** ' + (d.titulo || '?'),
      '**Episódio:** ' + (d.tituloEpisodio || '?'),
      '**Entendeu:** citado ' + ((d.citados || []).join(', ') || '—') + ' | convidado ' + ((d.convidados || []).join(', ') || '—') + ' | assunto ' + ((d.temas || []).join(', ') || '—'),
      '**Marcados:** ' + (ultimosEscolhidos.map(p => p.nome).join(' · ') || '—'),
      '**Buscas:** ' + ((d.buscas || []).map(b => b.busca + ' ' + b.aceitos + '/' + b.resultados).join(' · ') || '—'),
      '**Versão:** ' + VERSAO + ' · etapa ' + etapa,
      '',
      '<details><summary>Registro</summary>\n\n```\n' + log.slice(-50).map(x => x.t + ' ' + x.msg).join('\n') + '\n```\n</details>',
    ];
    let corpo = linhas.join('\n');
    if (corpo.length > 6000) corpo = corpo.slice(0, 6000) + '\n…(cortado)';
    const tituloAviso = 'Aviso: ' + (d.titulo || 'vídeo').slice(0, 70);
    try { GM_setClipboard('RELATÓRIO PRODUTOS FLOW\n' + corpo, 'text'); } catch {}
    window.open('https://github.com/erikbrasil/produtos-flow/issues/new?title=' + encodeURIComponent(tituloAviso) + '&body=' + encodeURIComponent(corpo), '_blank');
    status('Abri o aviso no GitHub (e copiei o relatório). Clique em "Create" lá.');
  }

  function mostrarConferencia(total, marcados, pouco) {
    const box = limpar(document.getElementById('pf-conf'));
    box.style.display = 'block';
    box.append(...[
      el('h4', {}, '⏸ Parada 1 — confira os produtos'),
      el('div', { class: pouco ? 'pf-alerta' : 'pf-ok' }, el('b', {}, (total ?? '?') + ' produto(s) marcado(s)'),
        pouco ? ' — abaixo do mínimo de ' + cfg.minimo + '. Você pode marcar mais à mão na janela do Studio.' : ''),
      el('ol', { id: 'pf-lista' }, ...marcados.map(p => el('li', {}, p.nome + ' ', el('span', { style: 'color:#888' }, '(' + p.rotulo + ')')))),
      el('div', { style: 'color:#aaa;margin-top:6px' }, 'Olhe a janela "Marcar produtos". Tire (botão do produto) ou acrescente à mão o que quiser. Quando estiver tudo certo:')].filter(Boolean));
    acoes(btn('✔ Está certo — marcar os tempos', () => rodar(etapaTempos)), btn('Parar aqui', () => { etapa = 'inicio'; acoesInicio(); status('Parado. Nada mais será feito.'); }, 'sec'), btnAvisar());
  }

  function mostrarFinal() {
    const box = limpar(document.getElementById('pf-conf'));
    box.style.display = 'block';
    box.append(...[
      el('h4', {}, '⏸ Parada 2 — confira os tempos'),
      ultimaCobertura && ultimaCobertura.faltaProdutos ? el('div', { class: 'pf-alerta' }, 'Sobrou trecho sem produto: cada produto cobre no máximo 1 minuto. Para cobrir o vídeo todo, faltam ' + ultimaCobertura.faltaProdutos + ' produto(s) — volte, marque mais e rode os tempos de novo.') : null,
      el('div', { class: 'pf-ok' }, 'Os tempos foram colocados. ', el('b', {}, 'Confira na janela do Studio'), ' e, se estiver tudo certo, clique em ', el('b', {}, '"Pronto"'), '.', el('br'),
        'Em vídeo já publicado, depois clique também em ', el('b', {}, '"Salvar"'), ' no alto da página.'),
      el('div', { style: 'color:#aaa;margin-top:6px' }, 'O script não clica em Pronto, Salvar nem Publicar.')].filter(Boolean));
    acoes(btn('Fechar / novo vídeo', () => { etapa = 'inicio'; cfg.dica = ''; const d = document.getElementById('pf-dica'); if (d) d.value = ''; acoesInicio(); status('Pronto para o próximo vídeo.'); }, 'sec'), btnAvisar());
  }

  async function rodar(fn) {
    if (ocupado) return;
    ocupado = true; parar = false; acoesRodando();
    try { await fn(); }
    catch (e) {
      registrar('ERRO: ' + e.message, diagnostico());
      const box = document.getElementById('pf-conf');
      box.style.display = 'block';
      limpar(box).append(el('div', { class: 'pf-alerta' }, el('b', {}, 'Deu erro: '), e.message, el('br'), 'Clique em "Copiar relatório" e cole na conversa com o Claude.'));
      acoes(btnAvisar(), btn('▶ Começar de novo', () => rodar(etapaProdutos)), ...(etapa === 'conferir-produtos' ? [btn('Tentar só os tempos', () => rodar(etapaTempos), 'sec')] : []));
    } finally { ocupado = false; }
  }

  function diagnostico() {
    const p = painelProdutos();
    return {
      url: location.href.replace(/[?#].*$/, ''),
      painel: p?.tipo || 'nenhum',
      cabecalhoPainel: p ? (p.el.innerText || '').trim().split('\n').slice(0, 3).join(' | ') : '',
      produtosNaTela: p ? todos('ytshopping-product', p.el).length : 0,
      linhasComBotao: p ? linhasDeProduto(p.el).length : 0,
      contador: p ? contagemMarcados(p.el) : null,
      campoBusca: p ? !!umVisivel(todos('input#search-input', p.el)) : false,
      avancar: p ? !!umVisivel(todos('#picker-next-button', p.el)) : false,
      botoesTempo: p ? todos('#add-timestamp-button', p.el).filter(visivel).length : 0,
      cursor: p ? !!umVisivel(todos('ytcp-media-timestamp-input input', p.el)) : false,
      botaoProdutos: !!umVisivel(todos('#products-description-button')),
      editarProdutos: !!umVisivel(todos('#shopping-toolbar-edit')),
      navegador: navigator.userAgent.replace(/.*(OPR|Chrome|Firefox|Edg)\/([\d.]+).*/, '$1 $2'),
    };
  }

  function copiarRelatorio() {
    const rel = { script: 'Produtos Flow', versao: VERSAO, quando: new Date().toISOString(), etapa, deteccao: ultimaDeteccao, escolhidos: ultimosEscolhidos.map(p => p.nome + ' [' + p.busca + ']'), ajustes: { alvo: cfg.alvo, minimo: cfg.minimo, extras: lerExtras(cfg.extras).map(c => c.nome) }, diagnostico: diagnostico(), registro: log.slice(-120) };
    const txt = 'RELATÓRIO PRODUTOS FLOW\n' + JSON.stringify(rel, null, 1);
    try { GM_setClipboard(txt, 'text'); status('Relatório copiado. Cole na conversa com o Claude.'); }
    catch { navigator.clipboard.writeText(txt).then(() => status('Relatório copiado.'), () => status('Não consegui copiar; selecione o registro e copie à mão.')); }
  }

  // O Studio é uma página que troca de tela sem recarregar: confere de tempos em tempos.
  let falhouMontar = false;
  setInterval(() => {
    if (!document.body) return;
    try { montar(); } catch (e) { if (!falhouMontar) { falhouMontar = true; console.error('[Produtos Flow] não consegui montar o botão:', e); } }
  }, 1500);
  console.info('[Produtos Flow] v' + VERSAO + ' carregado');
})();
