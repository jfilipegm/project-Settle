/**
 * The European Portuguese catalogue (M3 plan, S11): pt-PT spelling and
 * vocabulary, the impersonal "you" where Portuguese allows it, and the
 * voice of PRODUCT.md. Typed against the English catalogue, so a missing
 * or extra key fails `tsc`; `catalogue.test.ts` checks the parameters match.
 */
import type { Catalogue } from './t.ts'

export const pt: Catalogue = {
  nav: {
    main: 'Principal',
    skip: 'Saltar para o conteúdo',
    home: 'Settle, início',
    split: 'Dividir',
    household: 'Casa',
    settings: 'Definições',
  },

  theme: {
    label: {
      system: 'Sistema',
      light: 'Claro',
      dark: 'Escuro',
    },
    mode: {
      system: 'sistema',
      light: 'claro',
      dark: 'escuro',
    },
    toggle: 'Tema: {mode}',
    toggleName: 'Tema: {mode}. Mudar para {next}.',
  },

  household: {
    title: 'Casa',
    coming: 'Chega no M4: casas, membros e o registo de despesas.',
    split: 'Dividir uma conta',
  },

  home: {
    tagline: 'Dividir contas. Acertar contas. Sem expor nada.',
    intro:
      'Leia um talão ou introduza os artigos, diga quem consumiu o quê e veja quem deve quanto, ao cêntimo.',
    splitBill: 'Dividir uma conta',
    continueBill: 'Continuar a sua conta',
    privacy: 'Sem registo. As suas contas ficam neste dispositivo.',
  },

  notFound: {
    title: 'Página não encontrada',
    body: 'Não existe nada neste endereço.',
    home: 'Ir para a página inicial',
  },

  settings: {
    title: 'Definições',
    language: {
      heading: 'Idioma',
      label: 'Idioma',
      hint: 'Sistema segue o idioma do navegador.',
      option: {
        system: 'Sistema',
        en: 'English',
        pt: 'Português',
      },
    },
    theme: {
      heading: 'Tema',
      label: 'Tema',
      hint: 'Sistema segue a definição de claro ou escuro do dispositivo.',
    },
    region: {
      heading: 'Região',
      hint: 'Como os valores são escritos e mostrados. Mudar a moeda só muda o símbolo: os valores nunca são convertidos.',
      numberFormat: 'Formato dos números',
      currency: 'Moeda',
      example: 'Exemplo:',
      locale: {
        'pt-PT': 'Português (Portugal)',
        'en-GB': 'Inglês (Reino Unido)',
        'en-US': 'Inglês (EUA)',
      },
      currencyName: {
        EUR: 'Euro (€)',
        GBP: 'Libra esterlina (£)',
        USD: 'Dólar americano ($)',
      },
    },
    receipts: {
      heading: 'Leitura de talões',
      builtIn: 'Integrada: lida neste dispositivo com o PaddleOCR.',
      hint: 'A primeira leitura descarrega o leitor (cerca de 27 MB) deste site; o navegador guarda-o para as leituras seguintes. Os talões nunca saem do seu dispositivo.',
    },
    about: {
      licences: 'Licenças de terceiros',
      hint: 'As bibliotecas de código aberto que leem os talões, e as suas licenças.',
    },
  },

  split: {
    title: 'Dividir uma conta',
    steps: {
      label: 'Passos',
      receipt: 'Talão',
      items: 'Quem consumiu o quê',
      split: 'A divisão',
    },
    typeItIn: {
      heading: 'Sem talão?',
      hint: 'Adicione as pessoas e os artigos.',
      button: 'Introduzir à mão',
    },
    seeSplit: 'Ver a divisão',
    newBill: 'Nova conta',
    newBillConfirm: 'Começar uma nova conta? A conta atual é apagada.',
    savedHint:
      'Esta conta fica guardada neste dispositivo até começar uma nova.',

    people: {
      heading: 'Pessoas',
      count: 'Número de pessoas',
      remove: 'Remover uma pessoa',
      add: 'Adicionar uma pessoa',
      defaultName: 'Pessoa {n}',
      nameOf: 'Nome de',
      removeButton: 'Remover',
      whoPaid: 'Quem pagou?',
    },

    items: {
      heading: 'Artigos',
      assignTo: 'Atribuir a',
      assignHint: 'Escolha uma pessoa e toque nos artigos que consumiu.',
      everyone: 'Todos',
      everyoneFor: 'em {item}',
      edit: 'Editar',
      done: 'Concluir',
      sharers: 'Partilhado por {people}',
      nobody: 'Ainda ninguém partilha este artigo',
      personAdded: '{person} passa a partilhar {item}',
      personRemoved: '{person} deixa de partilhar {item}',
      everyoneAdded: 'Todos partilham {item}',
      add: 'Adicionar artigo',
      defaultName: 'Artigo {n}',
      check: 'Verificar',
      checkLine: '{item}: verifique esta linha',
      name: 'Nome',
      quantity: 'Quantidade',
      unitPrice: 'Preço unitário',
      lineTotal: 'Total da linha',
      remove: 'Remover',
      sharedBy: 'Partilhado por',
      shares: 'Partes',
      sharesFor: 'de {item}',
      shareOf: 'Parte de {person}',
      decreaseShare: 'Diminuir a parte de {person} em {item}',
      increaseShare: 'Aumentar a parte de {person} em {item}',
      unknownPerson: 'Pessoa desconhecida',
    },

    adjustments: {
      heading: 'Imposto, gorjeta e desconto',
      percentHint:
        'As percentagens são calculadas sobre o subtotal dos artigos.',
      amount: 'Valor',
      percentage: 'Percentagem',
      proportional: 'Pelo que cada pessoa consumiu',
      equally: 'Em partes iguais',
      tax: {
        name: 'Imposto',
        hint: 'Só o imposto que ainda não está incluído nos preços. Os preços em Portugal já incluem o IVA.',
        as: 'Imposto como',
        amountLabel: 'Valor do imposto',
        percentLabel: 'Percentagem do imposto (%)',
        splitThe: 'Dividir o imposto',
      },
      tip: {
        name: 'Gorjeta',
        hint: '',
        as: 'Gorjeta como',
        amountLabel: 'Valor da gorjeta',
        percentLabel: 'Percentagem da gorjeta (%)',
        splitThe: 'Dividir a gorjeta',
      },
      discount: {
        name: 'Desconto',
        hint: 'Dividido em proporção ao que cada pessoa consumiu.',
        as: 'Desconto como',
        amountLabel: 'Valor do desconto',
        percentLabel: 'Percentagem do desconto (%)',
        splitThe: 'Dividir o desconto',
      },
    },

    result: {
      heading: 'Quem deve o quê',
      fixThese: 'Corrija isto para ver a divisão:',
      goToCheck: 'Ir para a verificação do talão',
      itemsSubtotal: 'Subtotal dos artigos',
      billTotal: 'Total da conta',
      breakdown: 'Detalhe',
      breakdownFor: 'de {name}',
      roundingHint:
        'As linhas são arredondadas dentro do seu total, por isso as partes de um artigo podem somar um ou dois cêntimos a mais ou a menos do que o preço.',
      settleUp: 'Acertar contas',
      owes: '{from} deve a {to}',
      nobodyOwes: 'Ninguém deve nada.',
      copy: 'Copiar como texto',
      copied: 'Copiado.',
      copyFailed: 'Não foi possível copiar. O navegador bloqueou a cópia.',
    },

    copyText: {
      billTotal: 'Total da conta: {amount}',
      person: '{name}: {amount}',
      owes: '{from} deve a {to} {amount}',
    },

    errors: {
      subCent: 'Use no máximo 2 casas decimais',
      negative: 'Não pode ser negativo',
      atMost: 'No máximo {max}',
      enterAmount: 'Introduza um valor, por exemplo {example}',
      threeDecimals: 'Use no máximo 3 casas decimais',
      enterQuantity: 'Introduza uma quantidade, por exemplo 1 ou 0,5',
      quantityRange: 'A quantidade tem de ser maior do que 0 e no máximo {max}',
      enterPercent: 'Introduza uma percentagem, por exemplo 10',
      percentMax: 'No máximo {max} %',
      unassigned: 'Escolha quem partilha este artigo',
      discountAboveSubtotal:
        'O desconto não pode ser maior do que o subtotal dos artigos',
      proportionalWithZeroSubtotal:
        'Divida em partes iguais, ou introduza primeiro os preços dos artigos',
      peopleRange: 'Entre {min} e {max} pessoas',
      itemsRange: 'Entre {min} e {max} artigos',
      nameLength: 'No máximo {max} caracteres',
      amountRange: 'Introduza um valor de 0 a {max}',
      shareRange: 'As partes são números inteiros de 1 a {max}',
      invalidReference:
        '{field} não corresponde às pessoas desta conta. Comece uma nova conta.',
      fieldPeople: 'Pessoas',
      fieldItems: 'Artigos',
      fieldItem: 'Artigo',
      fieldPayer: 'Quem pagou',
      shareField: '{field}, parte de {person}',
    },
  },

  receipt: {
    notReadItem: 'Não lido do talão',

    scan: {
      heading: 'Ler um talão',
      privacy: 'Lido neste dispositivo. O talão nunca sai do seu navegador.',
      chooseFile: 'Escolher ficheiro',
      choosePdf: 'Escolher PDF',
      takePhoto: 'Tirar fotografia',
      dropHint: 'Ou largue aqui um ficheiro JPEG, PNG, HEIC ou PDF.',
      dropPdfHint: 'Ou largue aqui um ficheiro PDF.',
      cancel: 'Cancelar',
      replacePrompt:
        'Substituir os artigos atuais pelos do talão? As pessoas ficam como estão.',
      phase: {
        opening: 'A abrir o ficheiro…',
        loadingReader: 'A carregar o leitor (só da primeira vez)…',
        reading: 'A ler o texto…',
        readingProgress: 'A ler o texto… {percent}',
        checkingQr: 'A verificar o código QR…',
      },
    },

    error: {
      fallback: 'Pode introduzir os artigos abaixo.',
      unsupportedType:
        'Este tipo de ficheiro não pode ser lido. Use um JPEG, PNG, HEIC ou PDF.',
      tooLarge: 'Este ficheiro tem mais de 20 MB, é demasiado grande para ler.',
      tooManyPixels:
        'Esta fotografia é demasiado grande para ler. Tire a fotografia na resolução normal, ou recorte-a.',
      decodeFailed: 'Não foi possível abrir este ficheiro.',
      ocrFailed: 'Não foi possível ler o texto deste talão.',
      assetsUnavailable:
        'Não foi possível carregar o leitor de talões. Verifique a ligação: a primeira leitura descarrega-o.',
      readerUnsupported:
        'Este ficheiro tem de ser lido como imagem, e este navegador não consegue ler imagens. Um talão em PDF com texto selecionável funciona.',
      noItems: 'Não foram encontrados artigos neste talão.',
      cancelled: 'A leitura foi cancelada.',
    },

    support: {
      noWebAssembly:
        'Este navegador não consegue ler fotografias, porque o WebAssembly está desligado. Num iPhone, iPad ou Mac isto costuma ser o Modo de Isolamento, que pode desligar para este site: num iPhone ou iPad, toque em aA e depois em Definições do site; num Mac, escolha Safari e depois Definições para este site. Um talão em PDF de uma app continua a funcionar.',
      noSimd:
        'Este navegador não consegue ler fotografias: é demasiado antigo para o leitor de talões. Atualize o navegador (num iPhone ou iPad, atualize o iOS). Um talão em PDF de uma app continua a funcionar.',
    },

    warning: {
      noTotal:
        'Não foi encontrado um total no talão, por isso os artigos não podem ser comparados com ele.',
      totalMismatchQr:
        'O total impresso é diferente do total do código QR fiscal. É usado o total do código QR.',
      itemsTruncated:
        'O talão tem mais de 100 artigos. Só os primeiros 100 foram mantidos.',
      creditNote:
        'O código QR fiscal indica que isto é uma nota de crédito (um reembolso), não uma venda.',
      lowConfidence:
        'Esta fotografia foi difícil de ler. Verifique os artigos com atenção.',
      currencyDiffers:
        'Este talão está em {currency}, não na moeda da sua região. Os valores não são convertidos: mude a moeda em Definições → Região, se precisar.',
      anotherCurrency: 'outra moeda',
    },

    photo: {
      label: 'Conselhos sobre a fotografia',
      lead: 'Esta fotografia pode não ser bem lida. Pode cancelar e tirar uma melhor:',
      leadDone:
        'Esta fotografia pode não ter sido bem lida. Verifique os artigos, ou leia uma fotografia melhor:',
      noText:
        'Não foi encontrado texto nesta imagem. Confirme que é o talão, focado e bem iluminado.',
      smallText:
        'O texto desta imagem é pequeno, por isso alguns números podem ser mal lidos. Aproxime-se do talão. Para um talão de uma app, partilhe a imagem original como documento, ou use a exportação em PDF da app: é lida com exatidão.',
      blurred:
        'Esta fotografia parece desfocada. Segure o telemóvel com firmeza e deixe-o focar antes de tirar a fotografia.',
      dark: 'Esta fotografia está escura. Tire-a com mais luz.',
      faint:
        'O texto desta fotografia está pouco nítido. Tire-a com luz uniforme, sem o flash apontado diretamente ao talão.',
      glare:
        'Há reflexo no talão. Incline-o para longe da luz, ou desligue o flash.',
      cutOff:
        'O talão parece cortado na margem da fotografia. Inclua o talão inteiro, com algum espaço à volta.',
      farAway:
        'O talão está pequeno nesta fotografia. Aproxime-se, para que ocupe a maior parte da fotografia.',
    },

    check: {
      heading: 'Verificação do talão',
      merchant: 'Comerciante',
      date: 'Data',
      taxId: 'NIF',
      total: 'Total do talão',
      fromQr: '(do código QR fiscal)',
      fromText: '(lido do talão)',
      ivaIncluded: 'IVA incluído',
      matches: 'Corresponde ao total do talão.',
      mismatchLess: 'Os artigos somam {total}, {gap} a menos do que o talão.',
      mismatchMore: 'Os artigos somam {total}, {gap} a mais do que o talão.',
      noTotal: 'Não há um total do talão com que comparar os artigos.',
      billInvalid: 'Corrija os erros da conta para a comparar com o talão.',
      matchesAfterCut: {
        one: 'Corresponde depois de deixar de fora {count} linha lida abaixo dos artigos, no rodapé do talão. Confirme que não é um artigo:',
        other:
          'Corresponde depois de deixar de fora {count} linhas lidas abaixo dos artigos, no rodapé do talão. Confirme que não são artigos:',
      },
      unread:
        'Nenhum dos artigos pôde ser lido. O total do talão foi adicionado como um único artigo: divida-o assim, ou introduza os artigos.',
      incomplete:
        'Só foram lidos {read} dos {total} do talão. Adicione os artigos em falta, ou adicione a diferença como um único artigo.',
      leftOut: {
        one: '{count} linha ficou de fora abaixo dos artigos, no rodapé do talão. Confirme que não é um artigo:',
        other:
          '{count} linhas ficaram de fora abaixo dos artigos, no rodapé do talão. Confirme que não são artigos:',
      },
      leftOutList: 'Linhas deixadas de fora',
      notItems: 'Não são artigos',
      putBack: 'Repor as linhas',
      addDifference: 'Adicionar a diferença ({amount}) como artigo',
      percentageHint:
        'Adicione os artigos em falta, ou mude o imposto ou a gorjeta para um valor, para corresponder ao talão.',
      warnings: 'Avisos',
      reviewLines: 'Rever linhas',
      showImage: 'Mostrar a imagem do talão',
      imageAlt: 'O talão lido',
      dismiss: 'Fechar',
    },

    notice: {
      mismatchLess:
        'Estes totais não correspondem ao talão: os artigos somam {total}, {gap} a menos do que os {receiptTotal} do talão.',
      mismatchMore:
        'Estes totais não correspondem ao talão: os artigos somam {total}, {gap} a mais do que os {receiptTotal} do talão.',
      leftOut: {
        one: '{count} linha ficou de fora deste talão para corresponder ao total. Verifique-a antes de acertar contas.',
        other:
          '{count} linhas ficaram de fora deste talão para corresponder ao total. Verifique-as antes de acertar contas.',
      },
    },

    lines: {
      role: {
        item: 'Artigo',
        itemDetail: 'Detalhe do artigo',
        discount: 'Desconto ou poupança',
        total: 'Total ou subtotal',
        tip: 'Gorjeta',
        taxTable: 'Quadro de impostos',
        payment: 'Pagamento',
        ignored: 'Ignorada',
      },
      leftOutOfBill: '(deixada de fora da conta)',
      imageAlt: 'O talão lido, com uma caixa sobre cada linha lida',
      list: 'Linhas lidas do talão',
      added: 'Adicionada',
      addAsItem: 'Adicionar como artigo',
      full: 'A conta tem {max} artigos, o máximo possível: não é possível adicionar mais.',
      missed: 'Adicionar uma linha em falta',
      name: 'Nome',
      price: 'Preço',
      addMissed: 'Adicionar a linha em falta',
      enterName: 'Introduza um nome',
    },
  },
  households: {
    title: 'Casas',
    intro:
      'Uma casa guarda o que um grupo partilha ao longo do tempo: um apartamento, umas férias, um clube.',
    empty: 'Ainda não há casas',
    emptyHint:
      'Crie uma para as pessoas com quem partilha despesas. Tudo fica neste dispositivo.',
    new: 'Nova casa',
    open: 'Abrir {name}',
    memberCount: { one: '{count} pessoa', other: '{count} pessoas' },
    archived: 'Arquivadas',
    restore: 'Restaurar',
    restoreFor: 'Restaurar {name}',
    unreadable: {
      one: 'Não foi possível ler {count} casa. Fica guardada como estava.',
      other:
        'Não foi possível ler {count} casas. Ficam guardadas como estavam.',
    },
    create: {
      name: 'Nome da casa',
      nameHint: 'Por exemplo, a rua ou a viagem.',
      people: 'Pessoas',
      peopleHint: 'Pode adicionar mais pessoas depois.',
      person: 'Nome da pessoa {n}',
      addPerson: 'Adicionar uma pessoa',
      removePerson: 'Remover a pessoa {n}',
      submit: 'Criar casa',
    },
    cancel: 'Cancelar',
    save: 'Guardar',
    switch: '{name}, mudar de casa',
    tabs: {
      label: 'Casa',
      overview: 'Resumo',
      expenses: 'Despesas',
      members: 'Membros',
    },
    archivedNotice: 'Esta casa está arquivada.',
    errors: {
      nameRequired: 'Dê-lhe um nome.',
      nameTooLong: 'Use 60 caracteres ou menos.',
      tooManyPeople: 'Uma casa pode ter até 20 pessoas de cada vez.',
      saveFailed: 'Não foi possível guardar. Tente novamente.',
    },
    storage: {
      unavailableTitle: 'Não é possível guardar casas aqui',
      unavailable:
        'Este navegador não deixa o Settle guardar casas, muitas vezes numa janela privada ou com os dados do site bloqueados. A divisão continua a funcionar.',
      outdated:
        'O Settle foi atualizado noutro separador. Recarregue esta página para continuar.',
      blocked:
        'Feche os outros separadores do Settle para terminar a atualização.',
      reload: 'Recarregar',
      splitLink: 'Dividir uma conta',
    },
  },

  members: {
    title: 'Membros',
    left: 'Saíram',
    noneLeft: 'Ninguém saiu.',
    joined: 'Entrou a {date}',
    leftOn: 'Saiu a {date}',
    rename: 'Mudar o nome',
    renameFor: 'Mudar o nome de {name}',
    renameTitle: 'Mudar o nome de {name}',
    name: 'Nome',
    markLeft: 'Marcar saída',
    markLeftFor: 'Marcar a saída de {name}',
    markLeftTitle: '{name} saiu',
    leftDate: 'Data de saída',
    leftHint: 'Continua em todas as despesas passadas, com o seu histórico.',
    undoLeaving: 'Anular a saída',
    undoLeavingFor: 'Anular a saída de {name}',
    delete: 'Eliminar',
    deleteFor: 'Eliminar {name}',
    deleteTitle: 'Eliminar {name}?',
    deleteBody:
      'Como {name} não está em nenhuma despesa, pode eliminar esta pessoa. Isto não pode ser anulado.',
    inUse:
      'Como {name} está em despesas, não é possível eliminar esta pessoa. Marque a saída em vez disso.',
    unreadable:
      'Não foi possível ler algumas despesas desta casa, por isso esta pessoa não pode ser eliminada. Marque a saída em vez disso.',
    add: {
      title: 'Adicionar uma pessoa',
      name: 'Nome',
      joinedOn: 'Entrou a',
      submit: 'Adicionar',
    },
    errors: {
      limit: 'Uma casa pode ter até 20 pessoas de cada vez, e 50 no total.',
      leftBeforeJoined: 'Não pode sair antes de ter entrado.',
      dateInvalid: 'Introduza uma data.',
    },
    unreadableCount: {
      one: 'Não foi possível ler {count} membro. Fica guardado como estava.',
      other:
        'Não foi possível ler {count} membros. Ficam guardados como estavam.',
    },
    household: {
      title: 'Esta casa',
      rename: 'Mudar o nome da casa',
      archive: 'Arquivar a casa',
      archiveTitle: 'Arquivar {name}?',
      archiveBody:
        'Sai da lista de casas, com tudo o que tem guardado. Pode restaurá-la em Arquivadas.',
      archiveConfirm: 'Arquivar',
    },
  },

  overview: {
    noMembers: 'Adicione as pessoas que partilham as despesas',
    noMembersHint:
      'Uma casa precisa de pelo menos uma pessoa antes das despesas.',
    toMembers: 'Ir para Membros',
    noExpenses: 'Ainda não há despesas',
    noExpensesMonth: 'Sem despesas neste mês.',
    firstExpense: 'Adicione a primeira despesa',
    shared: {
      one: '{amount} partilhados em {count} despesa.',
      other: '{amount} partilhados em {count} despesas.',
    },
    addExpense: 'Adicionar despesa',
    quickExpense: 'Despesa rápida',
    quickExpenseHint:
      'Um valor, dividido em partes iguais, por partes, com valores exatos ou por percentagem.',
    previousMonth: 'Mês anterior',
    nextMonth: 'Mês seguinte',
    monthNav: 'Mês',
    latest: 'Últimas despesas',
    allExpenses: 'Todas as despesas',
    whereItWent: 'Onde foi o dinheiro',
  },

  expenses: {
    title: 'Despesas',
    filters: 'Filtros',
    member: 'Pessoa',
    allMembers: 'Todos',
    category: 'Categoria',
    allCategories: 'Todas as categorias',
    search: 'Pesquisar',
    searchHint: 'O que foi, a loja ou um artigo.',
    count: { one: '{count} despesa', other: '{count} despesas' },
    nothingMatches: 'Nenhuma despesa corresponde a estes filtros.',
    clear: 'Limpar os filtros',
    add: 'Adicionar despesa',
    unreadable: {
      one: 'Não foi possível ler {count} despesa. Fica guardada como estava.',
      other:
        'Não foi possível ler {count} despesas. Ficam guardadas como estavam.',
    },
    itemCount: { one: '({count} artigo)', other: '({count} artigos)' },
  },

  saveToHousehold: {
    open: 'Guardar numa casa',
    title: 'Guardar numa casa',
    household: 'Casa',
    noHouseholds: 'Ainda não há nenhuma casa.',
    createOne: 'Criar uma casa',
    whoIs: 'Quem é {name}?',
    choose: 'Escolha…',
    newMember: 'Adicionar como novo membro',
    moves:
      'A conta passa para a casa. A divisão recomeça do zero depois de guardar.',
    save: 'Guardar na casa',
    errors: {
      household: 'Escolha uma casa.',
      choose: 'Escolha quem é.',
      same: 'Duas pessoas não podem ser o mesmo membro.',
    },
    duplicate: {
      title: 'Este talão parece já estar guardado',
      body: '{description}, {date}, {amount}.',
      hint: 'Um talão diferente também pode coincidir, como duas compras com o mesmo total no mesmo dia.',
      saveAnyway: 'Guardar mesmo assim',
      open: 'Abrir essa despesa',
    },
  },

  editingExpense: {
    banner:
      'A editar {name}. As alterações só ficam guardadas com Guardar as alterações; recarregar a página descarta-as.',
    save: 'Guardar as alterações',
    cancel: 'Cancelar',
  },

  itemised: {
    items: 'Artigos',
    editItems: 'Editar os artigos',
    editDetails: 'Editar os detalhes',
    adjustments: 'Imposto, gorjeta e desconto',
    splitBill: 'Dividir uma conta',
    splitBillHint:
      'Artigo a artigo, com um talão lido ou introduzido à mão. As pessoas da casa são adicionadas por si.',
  },

  categories: {
    groceries: 'Supermercado',
    eatingOut: 'Refeições fora',
    rent: 'Renda',
    utilities: 'Água, luz e gás',
    internet: 'Internet',
    household: 'Casa',
    transport: 'Transportes',
    leisure: 'Lazer',
    other: 'Outros',
  },

  expense: {
    newTitle: 'Nova despesa',
    editTitle: 'Editar a despesa',
    description: 'O que foi?',
    descriptionHint: 'Por exemplo, Eletricidade, setembro.',
    amount: 'Valor',
    date: 'Data',
    category: 'Categoria',
    payer: 'Quem pagou?',
    payerHint: 'Qualquer pessoa da casa, mesmo quem não a partilha.',
    split: 'Divisão',
    method: {
      equal: 'Em partes iguais',
      shares: 'Por partes',
      exact: 'Valores exatos',
      percent: 'Por percentagem',
    },
    sharesFor: 'Partes de {name}',
    exactFor: 'Valor de {name}',
    percentFor: 'Percentagem de {name}',
    leftToSplit: 'Falta dividir {amount}',
    overSplit: '{amount} a mais',
    percentLeft: 'Falta {percent} %',
    percentOver: '{percent} % a mais',
    save: 'Guardar a despesa',
    cancel: 'Cancelar',
    edit: 'Editar',
    delete: 'Eliminar',
    deleteTitle: 'Eliminar {name}?',
    deleteBody:
      'Todos os totais são calculados de novo sem ela. Isto não pode ser anulado.',
    paidBy: 'Pago por',
    sharedBy: 'Partilhado por',
    yourShare: 'Parte de {name}',
    notFound: 'Esta despesa já não existe.',
    back: 'Voltar às despesas',
    errors: {
      description: 'Diga o que foi.',
      descriptionLength: 'Use 80 caracteres ou menos.',
      date: 'Introduza uma data.',
      dateRange: 'Use uma data de 2000 até daqui a um ano.',
      payer: 'Escolha quem pagou.',
      noMembers: 'Escolha pelo menos uma pessoa.',
      share: 'Use um número inteiro de 1 a 99.',
      percent: 'Use uma percentagem de 0 a 100, com até 3 casas decimais.',
      exactSum: 'Os valores somam {total}, não {amount}.',
      percentSum: 'As percentagens somam {total} %, não 100 %.',
      gone: 'Alguém nesta despesa foi removido noutro separador. Verifique as pessoas e guarde de novo.',
      save: 'Não foi possível guardar esta despesa. Tente novamente.',
    },
  },
}
