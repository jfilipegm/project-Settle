/**
 * The English catalogue, the source every other language is typed against
 * (M3 plan, S11). Every text a person sees lives here: `{name}` marks a
 * parameter, and an object with `one` and `other` is a plural, chosen by
 * the `count` parameter with `Intl.PluralRules`.
 *
 * Item names read from receipts are data and never come from here, and
 * neither do the parser's keywords.
 */
export const en = {
  nav: {
    main: 'Main',
    skip: 'Skip to content',
    home: 'Settle, home',
    split: 'Split',
    household: 'Household',
    settings: 'Settings',
  },

  theme: {
    label: {
      system: 'System',
      light: 'Light',
      dark: 'Dark',
    },
    // Lower-case, inside the toggle's sentence.
    mode: {
      system: 'system',
      light: 'light',
      dark: 'dark',
    },
    toggle: 'Theme: {mode}',
    toggleName: 'Theme: {mode}. Switch to {next}.',
  },

  household: {
    title: 'Household',
    coming: 'Coming in M4: households, members and the expense ledger.',
    split: 'Split a bill',
  },

  home: {
    tagline: 'Split bills. Settle up. Stay private.',
    intro:
      'Scan a receipt or type in the items, say who had what, and see who owes what, down to the cent.',
    splitBill: 'Split a bill',
    continueBill: 'Continue your bill',
    privacy: 'No account. Your bills stay on this device.',
  },

  notFound: {
    title: 'Page not found',
    body: 'There is nothing at this address.',
    home: 'Go to the home page',
  },

  settings: {
    title: 'Settings',
    language: {
      heading: 'Language',
      label: 'Language',
      hint: 'System follows your browser’s language.',
      option: {
        system: 'System',
        en: 'English',
        pt: 'Português',
      },
    },
    theme: {
      heading: 'Theme',
      label: 'Theme',
      hint: 'System follows your device’s light or dark setting.',
    },
    region: {
      heading: 'Region',
      hint: 'How amounts are typed and shown. Changing the currency only changes the symbol: amounts are never converted.',
      numberFormat: 'Number format',
      currency: 'Currency',
      example: 'Example:',
      locale: {
        'pt-PT': 'Portuguese (Portugal)',
        'en-GB': 'English (UK)',
        'en-US': 'English (US)',
      },
      currencyName: {
        EUR: 'Euro (€)',
        GBP: 'Pound sterling (£)',
        USD: 'US dollar ($)',
      },
    },
    receipts: {
      heading: 'Receipt reading',
      builtIn: 'Built-in: read on this device with PaddleOCR.',
      hint: 'The first scan downloads the reader (about 27 MB) from this site; your browser keeps it for the next scans. Receipts never leave your device.',
    },
    about: {
      licences: 'Third-party licences',
      hint: 'The open-source libraries that read receipts, and their licences.',
    },
  },

  split: {
    title: 'Split a bill',
    steps: {
      label: 'Steps',
      receipt: 'Receipt',
      items: 'Who had what',
      split: 'The split',
    },
    typeItIn: {
      heading: 'No receipt?',
      hint: 'Add the people and the items yourself.',
      button: 'Type it in',
    },
    seeSplit: 'See the split',
    newBill: 'New bill',
    newBillConfirm: 'Start a new bill? This clears the current one.',
    savedHint: 'This bill is saved on this device until you start a new one.',

    people: {
      heading: 'People',
      count: 'Number of people',
      remove: 'Remove a person',
      add: 'Add a person',
      defaultName: 'Person {n}',
      nameOf: 'Name of',
      removeButton: 'Remove',
      whoPaid: 'Who paid?',
    },

    items: {
      heading: 'Items',
      assignTo: 'Assign to',
      assignHint: 'Choose a person, then tap the items they had.',
      everyone: 'Everyone',
      everyoneFor: 'for {item}',
      edit: 'Edit',
      done: 'Done',
      sharers: 'Shared by {people}',
      nobody: 'Nobody shares this item yet',
      personAdded: '{person} now shares {item}',
      personRemoved: '{person} no longer shares {item}',
      everyoneAdded: 'Everyone shares {item}',
      add: 'Add item',
      defaultName: 'Item {n}',
      check: 'Check',
      checkLine: '{item}: check this line',
      name: 'Name',
      quantity: 'Quantity',
      unitPrice: 'Unit price',
      lineTotal: 'Line total',
      remove: 'Remove',
      sharedBy: 'Shared by',
      shares: 'Shares',
      sharesFor: 'for {item}',
      shareOf: "{person}'s share",
      decreaseShare: "Decrease {person}'s share of {item}",
      increaseShare: "Increase {person}'s share of {item}",
      unknownPerson: 'Unknown person',
    },

    adjustments: {
      heading: 'Tax, tip and discount',
      percentHint: 'Percentages are taken from the items subtotal.',
      amount: 'Amount',
      percentage: 'Percentage',
      proportional: 'By what each person had',
      equally: 'Equally',
      tax: {
        name: 'Tax',
        hint: 'Only tax not already included in the prices. Portuguese prices already include IVA.',
        as: 'Tax as',
        amountLabel: 'Tax amount',
        percentLabel: 'Tax percentage (%)',
        splitThe: 'Split the tax',
      },
      tip: {
        name: 'Tip',
        hint: '',
        as: 'Tip as',
        amountLabel: 'Tip amount',
        percentLabel: 'Tip percentage (%)',
        splitThe: 'Split the tip',
      },
      discount: {
        name: 'Discount',
        hint: 'Split in proportion to what each person had.',
        as: 'Discount as',
        amountLabel: 'Discount amount',
        percentLabel: 'Discount percentage (%)',
        splitThe: 'Split the discount',
      },
    },

    result: {
      heading: 'Who owes what',
      fixThese: 'Fix these to see the split:',
      goToCheck: 'Go to the receipt check',
      itemsSubtotal: 'Items subtotal',
      billTotal: 'Bill total',
      breakdown: 'Breakdown',
      breakdownFor: 'for {name}',
      roundingHint:
        "Lines are rounded within your total, so one item's shares can add up to a cent or two more or less than its price.",
      settleUp: 'Settle up',
      owes: '{from} owes {to}',
      nobodyOwes: 'Nobody owes anything.',
      copy: 'Copy as text',
      copied: 'Copied.',
      copyFailed: "Couldn't copy. Your browser blocked it.",
    },

    // "Copy as text": for people to read, not a data format.
    copyText: {
      billTotal: 'Bill total: {amount}',
      person: '{name}: {amount}',
      owes: '{from} owes {to} {amount}',
    },

    errors: {
      subCent: 'Use at most 2 decimal places',
      negative: "Can't be negative",
      atMost: 'At most {max}',
      enterAmount: 'Enter an amount, like {example}',
      threeDecimals: 'Use at most 3 decimal places',
      enterQuantity: 'Enter a quantity, like 1 or 0,5',
      quantityRange: 'Quantity must be more than 0 and at most {max}',
      enterPercent: 'Enter a percentage, like 10',
      percentMax: 'At most {max} %',
      unassigned: 'Choose who shares this item',
      discountAboveSubtotal:
        "The discount can't be more than the items subtotal",
      proportionalWithZeroSubtotal:
        'Split this equally, or enter item prices first',
      peopleRange: 'Between {min} and {max} people',
      itemsRange: 'Between {min} and {max} items',
      nameLength: 'At most {max} characters',
      amountRange: 'Enter an amount from 0 to {max}',
      shareRange: 'Shares are whole numbers from 1 to {max}',
      invalidReference:
        "{field} doesn't match the people on this bill. Start a new bill.",
      fieldPeople: 'People',
      fieldItems: 'Items',
      fieldItem: 'Item',
      fieldPayer: 'Who paid',
      shareField: "{field}, {person}'s share",
    },
  },

  receipt: {
    notReadItem: 'Not read from the receipt',

    scan: {
      heading: 'Scan a receipt',
      privacy: 'Read on this device. The receipt never leaves your browser.',
      chooseFile: 'Choose file',
      choosePdf: 'Choose PDF',
      takePhoto: 'Take photo',
      dropHint: 'Or drop a JPEG, PNG, HEIC or PDF file here.',
      dropPdfHint: 'Or drop a PDF file here.',
      cancel: 'Cancel',
      replacePrompt:
        'Replace the current items with the receipt’s? People stay as they are.',
      phase: {
        opening: 'Opening the file…',
        loadingReader: 'Loading the reader (first time only)…',
        reading: 'Reading the text…',
        readingProgress: 'Reading the text… {percent}',
        checkingQr: 'Checking the QR code…',
      },
    },

    // D16: each read error ends by pointing at the manual editor.
    error: {
      fallback: 'You can type the items in below.',
      unsupportedType:
        'This file type can’t be read. Use a JPEG, PNG, HEIC or PDF.',
      tooLarge: 'This file is over 20 MB, too large to read.',
      tooManyPixels:
        'This photo is too large to read. Take the photo at normal resolution, or crop it.',
      decodeFailed: 'This file couldn’t be opened.',
      ocrFailed: 'The text on this receipt couldn’t be read.',
      assetsUnavailable:
        'The receipt reader couldn’t load. Check your connection: the first scan downloads it.',
      readerUnsupported:
        'This file has to be read as an image, and this browser can’t read images. A PDF receipt with selectable text works.',
      noItems: 'No items were found on this receipt.',
      cancelled: 'Reading was cancelled.',
    },

    support: {
      noWebAssembly:
        'Photos can’t be read in this browser, because WebAssembly is turned off. On an iPhone, iPad or Mac this is usually Lockdown Mode, which you can turn off for this site: on an iPhone or iPad, tap aA, then Website Settings; on a Mac, choose Safari, then Settings for This Website. A PDF receipt from an app still works.',
      noSimd:
        'Photos can’t be read in this browser: it’s too old for the receipt reader. Update the browser (on an iPhone or iPad, update iOS). A PDF receipt from an app still works.',
    },

    warning: {
      noTotal:
        'No total was found on the receipt, so the items can’t be checked against it.',
      totalMismatchQr:
        'The printed total differs from the fiscal QR code’s. The QR code’s total is used.',
      itemsTruncated:
        'The receipt has more than 100 items. Only the first 100 were kept.',
      creditNote:
        'The fiscal QR code says this is a credit note (a refund), not a sale.',
      lowConfidence: 'This photo was hard to read. Check the items carefully.',
      currencyDiffers:
        'This receipt is in {currency}, not your region’s currency. Amounts aren’t converted: change the currency in Settings → Region if you need to.',
      anotherCurrency: 'another currency',
    },

    // P11: one specific piece of advice per issue.
    photo: {
      label: 'Photo advice',
      lead: 'This photo may not read well. You can cancel and take a better one:',
      leadDone:
        'This photo may not have read well. Check the items, or scan a better photo:',
      noText:
        'No text was found in this image. Check it’s the receipt, in focus and well lit.',
      smallText:
        'The text in this image is small, so some numbers may be misread. Move closer to the receipt. For a receipt from an app, share the original image as a document, or use the app’s PDF export: it’s read exactly.',
      blurred:
        'This photo looks blurred. Hold the phone steady and let it focus before taking the photo.',
      dark: 'This photo is dark. Take it in more light.',
      faint:
        'The text in this photo is faint. Take it in even light, without the flash pointing straight at the receipt.',
      glare:
        'There’s glare on the receipt. Tilt it away from the light, or turn off the flash.',
      cutOff:
        'The receipt seems cut off at the edge of the photo. Include the whole receipt, with a little space around it.',
      farAway:
        'The receipt is small in this photo. Come closer, so it fills most of the photo.',
    },

    check: {
      heading: 'Receipt check',
      merchant: 'Merchant',
      date: 'Date',
      taxId: 'NIF',
      total: 'Receipt total',
      fromQr: '(from the fiscal QR code)',
      fromText: '(read from the receipt)',
      ivaIncluded: 'IVA included',
      matches: 'Matches the receipt total.',
      mismatchLess: 'Items add up to {total}, {gap} less than the receipt.',
      mismatchMore: 'Items add up to {total}, {gap} more than the receipt.',
      noTotal: 'No receipt total to compare the items with.',
      billInvalid: 'Fix the bill’s errors to compare it with the receipt.',
      matchesAfterCut: {
        one: 'Matches after leaving out {count} line read below the items as the receipt’s footer. Check they aren’t items:',
        other:
          'Matches after leaving out {count} lines read below the items as the receipt’s footer. Check they aren’t items:',
      },
      unread:
        'None of the items could be read. The receipt’s total was added as one item: split it as it is, or type the items in.',
      incomplete:
        'Only {read} of the receipt’s {total} was read. Add the missing items, or add the difference as one item.',
      leftOut: {
        one: '{count} line was left out below the items as the receipt’s footer. Check they aren’t items:',
        other:
          '{count} lines were left out below the items as the receipt’s footer. Check they aren’t items:',
      },
      leftOutList: 'Lines left out',
      notItems: 'They aren’t items',
      putBack: 'Put them back',
      addDifference: 'Add the difference ({amount}) as an item',
      percentageHint:
        'Add the missing items, or change the tax or tip to an amount, to match the receipt.',
      warnings: 'Warnings',
      reviewLines: 'Review lines',
      showImage: 'Show receipt image',
      imageAlt: 'The scanned receipt',
      dismiss: 'Dismiss',
    },

    // R12, R24: what the result section, and "Copy as text", say.
    notice: {
      mismatchLess:
        'These totals don’t match the receipt: the items add up to {total}, {gap} less than the receipt’s {receiptTotal}.',
      mismatchMore:
        'These totals don’t match the receipt: the items add up to {total}, {gap} more than the receipt’s {receiptTotal}.',
      leftOut: {
        one: '{count} line was left out of this receipt to match its total. Check them before settling up.',
        other:
          '{count} lines were left out of this receipt to match its total. Check them before settling up.',
      },
    },

    // P15: "Review lines".
    lines: {
      role: {
        item: 'Item',
        itemDetail: 'Item detail',
        discount: 'Discount or savings',
        total: 'Total or subtotal',
        tip: 'Tip',
        taxTable: 'Tax table',
        payment: 'Payment',
        ignored: 'Ignored',
      },
      leftOutOfBill: '(left out of the bill)',
      imageAlt: 'The scanned receipt, with a box over each line read',
      list: 'Lines read from the receipt',
      added: 'Added',
      addAsItem: 'Add as item',
      full: 'The bill has {max} items, the most it can hold: nothing more can be added.',
      missed: 'Add a missed line',
      name: 'Name',
      price: 'Price',
      addMissed: 'Add the missed line',
      enterName: 'Enter a name',
    },
  },
  // M4: households and members (plan, H7, H9, H13).
  households: {
    title: 'Households',
    intro:
      'A household keeps what a group shares over time: a flat, a holiday, a club.',
    empty: 'No households yet',
    emptyHint:
      'Create one for the people you share costs with. Everything stays on this device.',
    new: 'New household',
    open: 'Open {name}',
    memberCount: { one: '{count} person', other: '{count} people' },
    archived: 'Archived',
    restore: 'Restore',
    restoreFor: 'Restore {name}',
    unreadable: {
      one: '{count} household couldn’t be read. It is kept as it was.',
      other: '{count} households couldn’t be read. They are kept as they were.',
    },
    create: {
      name: 'Household name',
      nameHint: 'For example, the street or the trip.',
      people: 'People',
      peopleHint: 'You can add more people later.',
      person: 'Name of person {n}',
      addPerson: 'Add a person',
      removePerson: 'Remove person {n}',
      submit: 'Create household',
    },
    cancel: 'Cancel',
    save: 'Save',
    switch: '{name}, switch household',
    tabs: {
      label: 'Household',
      overview: 'Overview',
      expenses: 'Expenses',
      balances: 'Balances',
      members: 'Members',
    },
    archivedNotice: 'This household is archived.',
    errors: {
      nameRequired: 'Give it a name.',
      nameTooLong: 'Use 60 characters or fewer.',
      tooManyPeople: 'A household can have up to 20 people at a time.',
      saveFailed: 'This couldn’t be saved. Try again.',
    },
    storage: {
      unavailableTitle: 'Households can’t be saved here',
      migrationFailedTitle: 'Settle couldn’t update its data',
      migrationFailed:
        'Settle couldn’t update the data on this device. Nothing was changed. Reload to try again; your split still works.',
      unavailable:
        'This browser isn’t letting Settle save households, often in a private window or with site data blocked. Your split still works.',
      outdated:
        'Settle was updated in another tab. Reload this page to keep going.',
      blocked: 'Close Settle’s other tabs to finish updating.',
      reload: 'Reload',
      splitLink: 'Split a bill',
    },
  },

  members: {
    title: 'Members',
    left: 'Left',
    noneLeft: 'Nobody has left.',
    joined: 'Joined {date}',
    leftOn: 'Left {date}',
    rename: 'Rename',
    renameFor: 'Rename {name}',
    renameTitle: 'Rename {name}',
    name: 'Name',
    markLeft: 'Mark as left',
    markLeftFor: 'Mark {name} as left',
    markLeftTitle: '{name} has left',
    leftDate: 'Date they left',
    leftHint: 'They stay on every past expense, with their history.',
    undoLeaving: 'Undo leaving',
    undoLeavingFor: 'Undo leaving for {name}',
    delete: 'Delete',
    deleteFor: 'Delete {name}',
    deleteTitle: 'Delete {name}?',
    deleteBody:
      '{name} can be deleted if they aren’t on any expense or payment. This can’t be undone.',
    inUse:
      '{name} is on expenses or payments, so they can’t be deleted. Mark them as left instead.',
    unreadable:
      'Some expenses or payments in this household couldn’t be read, so this person can’t be deleted. Mark them as left instead.',
    add: {
      title: 'Add a person',
      name: 'Name',
      joinedOn: 'Joined on',
      submit: 'Add',
    },
    errors: {
      limit: 'A household can have up to 20 people at a time, and 50 in all.',
      leftBeforeJoined: 'They can’t leave before they joined.',
      dateInvalid: 'Enter a date.',
    },
    unreadableCount: {
      one: '{count} member couldn’t be read. It is kept as it was.',
      other: '{count} members couldn’t be read. They are kept as they were.',
    },
    household: {
      title: 'This household',
      rename: 'Rename household',
      archive: 'Archive household',
      archiveTitle: 'Archive {name}?',
      archiveBody:
        'It leaves the list of households, with everything in it kept. You can restore it from Archived.',
      archiveConfirm: 'Archive',
    },
  },

  overview: {
    noMembers: 'Add the people who share costs',
    noMembersHint: 'A household needs at least one person before expenses.',
    toMembers: 'Go to Members',
    noExpenses: 'No expenses yet',
    noExpensesMonth: 'No expenses this month.',
    firstExpense: 'Add your first expense',
    shared: {
      one: '{amount} shared across {count} expense.',
      other: '{amount} shared across {count} expenses.',
    },
    addExpense: 'Add expense',
    quickExpense: 'Quick expense',
    quickExpenseHint:
      'An amount, split equally, by shares, exactly or by percentage.',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    monthNav: 'Month',
    latest: 'Latest expenses',
    allExpenses: 'All expenses',
    whereItWent: 'Where it went',
    whereItWentChart: 'Where it went: {slices}.',
    theRest: 'The rest',
    percent: '{percent} %',
    byDay: 'Day by day',
    byDaySummary: '{total} spent in {month}; the most on {day}, {amount}.',
    byDayNone: 'Nothing spent in {month}.',
    lastMonths: 'The last six months',
    monthBar: '{month}: {amount}',
    monthBarCurrent: '{month}, this month: {amount}',
    lastMonthsSummary:
      '{total} over the six months; the most in {month}, {amount}.',
    upTo: 'Up to {amount}',
  },

  expenses: {
    title: 'Expenses',
    columns: {
      date: 'Date',
      description: 'Description',
      category: 'Category',
      paidBy: 'Paid by',
      amount: 'Amount',
    },
    filters: 'Filters',
    member: 'Person',
    allMembers: 'Everyone',
    category: 'Category',
    allCategories: 'All categories',
    search: 'Search',
    searchHint: 'What it was, the shop or an item.',
    count: { one: '{count} expense', other: '{count} expenses' },
    nothingMatches: 'No expense matches these filters.',
    clear: 'Clear the filters',
    add: 'Add expense',
    unreadable: {
      one: '{count} expense couldn’t be read. It is kept as it was.',
      other: '{count} expenses couldn’t be read. They are kept as they were.',
    },
    unreadablePayments: {
      one: '{count} payment couldn’t be read. It is kept as it was.',
      other: '{count} payments couldn’t be read. They are kept as they were.',
    },
    itemCount: { one: '({count} item)', other: '({count} items)' },
  },

  saveToHousehold: {
    open: 'Save to a household',
    title: 'Save to a household',
    household: 'Household',
    noHouseholds: 'There is no household yet.',
    createOne: 'Create a household',
    whoIs: 'Who is {name}?',
    choose: 'Choose…',
    newMember: 'Add as a new member',
    moves:
      'The bill moves into the household. The split starts fresh after saving.',
    save: 'Save to household',
    errors: {
      household: 'Choose a household.',
      choose: 'Choose who this is.',
      same: 'Two people can’t be the same member.',
    },
    duplicate: {
      title: 'This receipt looks already saved',
      body: '{description}, {date}, {amount}.',
      hint: 'A different receipt can match too, such as two purchases of the same total on one day.',
      saveAnyway: 'Save anyway',
      open: 'Open that expense',
    },
  },

  editingExpense: {
    banner:
      'Editing {name}. Changes are saved only with Save changes; reloading the page discards them.',
    save: 'Save changes',
    cancel: 'Cancel',
  },

  itemised: {
    items: 'Items',
    editItems: 'Edit items',
    editDetails: 'Edit details',
    adjustments: 'Tax, tip and discount',
    splitBill: 'Split a bill',
    splitBillHint:
      'Item by item, with a receipt scan or typed in. The household’s people are added for you.',
  },

  categories: {
    groceries: 'Groceries',
    eatingOut: 'Eating out',
    rent: 'Rent',
    utilities: 'Utilities',
    internet: 'Internet',
    household: 'Household',
    transport: 'Transport',
    leisure: 'Leisure',
    other: 'Other',
  },

  expense: {
    newTitle: 'New expense',
    editTitle: 'Edit expense',
    description: 'What was it?',
    descriptionHint: 'For example, Electricity, September.',
    amount: 'Amount',
    date: 'Date',
    category: 'Category',
    payer: 'Who paid?',
    payerHint: 'Anyone in the household, even someone not sharing it.',
    split: 'Split',
    method: {
      equal: 'Equally',
      shares: 'By shares',
      exact: 'Exact amounts',
      percent: 'By percentage',
    },
    sharesFor: 'Shares for {name}',
    exactFor: 'Amount for {name}',
    percentFor: 'Percentage for {name}',
    leftToSplit: '{amount} left to split',
    overSplit: '{amount} too much',
    percentLeft: '{percent} % left',
    percentOver: '{percent} % too much',
    save: 'Save expense',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    deleteTitle: 'Delete {name}?',
    deleteBody:
      'Every total is worked out again without it. This can’t be undone.',
    paidBy: 'Paid by',
    sharedBy: 'Shared by',
    yourShare: '{name}’s share',
    notFound: 'This expense isn’t here any more.',
    notFoundTitle: 'Expense not found',
    back: 'Back to expenses',
    close: 'Close',
    sharesChart: 'Each share of {amount}: {shares}.',
    errors: {
      description: 'Say what it was.',
      descriptionLength: 'Use 80 characters or fewer.',
      date: 'Enter a date.',
      dateRange: 'Use a date from 2000 to a year from today.',
      payer: 'Choose who paid.',
      noMembers: 'Choose at least one person.',
      share: 'Use a whole number from 1 to 99.',
      percent: 'Use a percentage from 0 to 100, with up to 3 decimals.',
      exactSum: 'The amounts add up to {total}, not {amount}.',
      percentSum: 'The percentages add up to {total} %, not 100 %.',
      gone: 'Someone on this expense was removed in another tab. Check the people and save again.',
      deleted: 'This expense was deleted in another tab, so it wasn’t saved.',
      save: 'This expense couldn’t be saved. Try again.',
    },
  },

  balances: {
    title: 'Balances',
    settleIn: {
      one: 'Settle up in {count} payment.',
      other: 'Settle up in {count} payments.',
    },
    settled: 'Everyone is settled up.',
    incompleteHeading: 'Balances from the records that could be read.',
    incomplete: {
      one: '{count} record couldn’t be read, so these balances leave something out. Settle up isn’t suggested until it can be read.',
      other:
        '{count} records couldn’t be read, so these balances leave something out. Settle up isn’t suggested until they can be read.',
    },
    noBalanceIncomplete: 'No balance in the records that could be read.',
    getsBack: 'Gets back',
    owes: 'Owes',
    settledUp: 'Settled up',
    noBalance: 'No balance',
    paid: 'Paid {amount}',
    leftOn: 'Left on {date}',
    settleUp: 'Settle up',
    settleUpHint: {
      one: 'One payment clears every balance.',
      other: '{count} payments clear every balance.',
    },
    pays: '{from} pays {to}',
    markAsPaid: 'Mark as paid',
    markAsPaidFor: 'Mark as paid: {from} pays {to} {amount}',
    record: 'Record a payment',
    on: 'Balances on',
    onHint: 'All expenses and payments',
    onNotice: 'These are the balances on {date}.',
    showAll: 'Show all',
    future: {
      expenses: { one: '{count} expense', other: '{count} expenses' },
      payments: { one: '{count} payment', other: '{count} payments' },
      one: 'Includes {what} dated after today.',
      both: 'Includes {expenses} and {payments} dated after today.',
    },
    noRecords: 'No expenses or payments yet.',
    addExpense: 'Add an expense',
    across: 'Across all expenses and payments.',
    details: 'Details',
    overviewIncomplete: {
      one: '{count} record couldn’t be read.',
      other: '{count} records couldn’t be read.',
    },
    recorded: 'Payment recorded.',
    copy: 'Copy as text',
    copied: 'Copied.',
    copyFailed: 'Couldn’t copy. Your browser blocked it.',
    share: 'Share',
  },

  payment: {
    title: 'Record a payment',
    editTitle: 'Edit payment',
    from: 'From',
    to: 'To',
    amount: 'Amount',
    date: 'Date',
    note: 'Note',
    noteHint: 'Optional, up to 80 characters.',
    choose: 'Choose someone',
    left: '{name} (left)',
    after: 'After this, {first} and {second}.',
    outcome: {
      owes: '{name} owes {amount}',
      getsBack: '{name} gets back {amount}',
      settled: '{name} is settled up',
    },
    incomplete: {
      one: '{count} record couldn’t be read, so the outcome isn’t shown.',
      other: '{count} records couldn’t be read, so the outcome isn’t shown.',
    },
    save: 'Save payment',
    cancel: 'Cancel',
    errors: {
      choose: 'Choose who paid and who received.',
      same: 'Choose two different people.',
      date: 'Enter a date.',
      dateRange: 'Use a date from 2000 to a year from today.',
      note: 'Use 80 characters or fewer.',
      gone: 'Someone on this payment was removed in another tab. Check the people and save again.',
      deleted: 'This payment was deleted in another tab, so it wasn’t saved.',
      save: 'This payment couldn’t be saved. Try again.',
    },
  },

  explain: {
    title: '{name}’s balance',
    back: 'All balances',
    sums: 'Paid {paid} · Share {share} · Sent {sent} · Received {received}',
    expenseLine: 'Paid {paid} · Share {share}',
    paidTo: 'Paid {name}',
    from: 'From {name}',
    total: 'Balance',
    nothing: 'No expenses or payments for {name} yet.',
  },

  history: {
    paid: '{from} paid {to}',
    paymentRow: 'Payment, {date}, {paid}, {amount}',
  },

  paymentView: {
    from: 'From',
    to: 'To',
    date: 'Date',
    note: 'Note',
    edit: 'Edit',
    delete: 'Delete',
    deleteTitle: 'Delete this payment?',
    deleteBody: 'The balances change back.',
    deleteConfirm: 'Delete payment',
    cancel: 'Cancel',
    deleteFailed: 'This payment couldn’t be deleted. Try again.',
    notFoundTitle: 'Payment not found',
    notFound:
      'This payment doesn’t exist any more. It may have been deleted in another tab.',
    close: 'Close',
  },

  balanceText: {
    header: '{name}, balances',
    getsBack: '{name} gets back {amount}',
    owes: '{name} owes {amount}',
    settled: '{name} is settled up',
    toSettle: {
      one: 'To settle up, {count} payment:',
      other: 'To settle up, {count} payments:',
    },
    pays: '{from} pays {to} {amount}',
  },

  exchange: {
    csv: {
      export: 'Export CSV',
      type: 'Type',
      date: 'Date',
      description: 'Description',
      category: 'Category',
      paidBy: 'Paid by',
      to: 'To',
      amount: 'Amount ({currency})',
      expense: 'Expense',
      payment: 'Payment',
      done: 'Spreadsheet file ready: every expense and payment, with each person’s share.',
      failed: 'The spreadsheet file couldn’t be made. Try again.',
    },
    share: {
      title: 'Share and export',
      privacy:
        'The file has names, amounts, dates, descriptions and shop names. Anyone who gets it can read it.',
      shareFile: 'Share household file',
      ready:
        'File ready. Send it to your housemates; they open it with Open a Settle file.',
      nothing: 'This household can’t be read, so there is nothing to share.',
      failed: 'The file couldn’t be made. Try again.',
    },
    leftOut: {
      intro: {
        one: '{count} record isn’t in the file: {reasons}.',
        other: '{count} records aren’t in the file: {reasons}.',
      },
      unreadable: {
        one: '{count} couldn’t be read',
        other: '{count} couldn’t be read',
      },
      invalid: {
        one: '{count} has a value a file can’t hold',
        other: '{count} have a value a file can’t hold',
      },
      namesLeftOut: {
        one: '{count} names a record that isn’t in it',
        other: '{count} name a record that isn’t in it',
      },
      keep: 'They stay on this phone.',
      continue: 'Make the file anyway',
      cancel: 'Cancel',
    },
    data: {
      title: 'Your data',
      lastBackup: 'Last backup: {date}',
      noBackup: 'No backup yet',
      hint: 'A backup is one file with every household. Keep it somewhere other than this phone.',
      backUp: 'Back up now',
      restore: 'Restore from a file',
      restoreHint:
        'Restoring adds what this phone is missing. It doesn’t undo changes made since the backup.',
      done: 'Backup ready. Keep the file somewhere other than this phone.',
      failed: 'The backup couldn’t be made. Try again.',
      word: 'backup',
    },
    reminder: {
      label: 'Backup reminder',
      text: {
        one: 'Your changes from the last {count} day aren’t backed up.',
        other: 'Your changes from the last {count} days aren’t backed up.',
      },
      later: 'Later',
    },
    open: {
      title: 'Open a Settle file',
      action: 'Open a Settle file',
      restoreBackup: 'Restore from a backup',
      intro:
        'Choose a Settle file that someone shared with you, or one of your backups.',
      file: 'Settle file',
      hint: 'Settle checks it and shows what it would do. Nothing is written until you press Apply.',
      reading: 'Checking the file…',
      cantOpen: 'This file can’t be opened',
      nothingWritten:
        'Nothing was written. Ask for a new file, or choose another one.',
      more: {
        one: 'And {count} more problem.',
        other: 'And {count} more problems.',
      },
      another: 'Choose another file',
    },
    problem: {
      tooLarge: 'The file is over 20 MB, so it isn’t a Settle file.',
      notJson: 'The file is damaged (it isn’t valid JSON).',
      notSettle: 'The file isn’t a Settle file.',
      newerVersion:
        'This file was made by a newer Settle. Update Settle to open it.',
      migrationFailed:
        'This file is from an older Settle and couldn’t be brought up to date.',
      badShape: 'The file is damaged: part of it is missing or out of shape.',
      unknownKey: 'The file has a part this Settle doesn’t know: “{key}”.',
      unknownKind: 'The file is neither a household nor a backup.',
      householdCount: 'A household file must hold exactly one household.',
      badTimestamp: 'The file has a time that isn’t valid.',
      badTimestampOf: '{record} has a time that isn’t valid.',
      unreadable: '{record} can’t be read.',
      badId: '{record} has an id that isn’t valid.',
      badPosition: '{record} has a position that isn’t valid.',
      wrongHousehold: '{record} belongs to another household.',
      missingMember: '{record} names a member who isn’t in the file.',
      duplicateId: '{record} appears twice.',
      tooManyActive: '{record} would have more than 20 people on {date}.',
      tooManyMembers: '{record} would have more than 50 people.',
      missingVersion: '{record} has no version.',
      duplicateVersion: '{record} has two versions.',
      versions: 'The file’s record versions are damaged.',
    },
    record: {
      expense: 'The expense “{label}” on {date}',
      expenseNoDate: 'The expense “{label}”',
      settlement: 'The payment on {date}',
      settlementNoDate: 'A payment',
      member: 'The member “{label}”',
      household: 'The household “{label}”',
      unnamed: 'A record',
    },
    preview: {
      fileName: 'File: {name}',
      newHousehold: '{name}: new on this device.',
      newCounts: '{members}, {expenses}, {payments}.',
      people: { one: '{count} person', other: '{count} people' },
      expenses: { one: '{count} expense', other: '{count} expenses' },
      payments: { one: '{count} payment', other: '{count} payments' },
      nothingNew: 'Nothing new',
      nothingNewFile: 'Nothing new in this file.',
      count: {
        newExpense: {
          one: '{count} new expense',
          other: '{count} new expenses',
        },
        newPayment: {
          one: '{count} new payment',
          other: '{count} new payments',
        },
        newMember: { one: '{count} new person', other: '{count} new people' },
        changed: { one: '{count} changed', other: '{count} changed' },
        deleted: { one: '{count} deleted', other: '{count} deleted' },
      },
      leftOutWhole:
        'Kept as it is: this phone can’t read this household’s own record.',
      leftOutWholeForeign:
        'Left out: this phone uses that household’s id for something else.',
      keptRecord: 'Kept as it is: {record} couldn’t be read here.',
      foreignRecord:
        'Left out: {record} uses an id this phone uses for something else.',
      notAdded:
        'Not added: {record} names {name}, whose record couldn’t be read here.',
      kept: {
        one: '{name} stays: on {count} record you’re keeping.',
        other: '{name} stays: on {count} records you’re keeping.',
      },
      keptFromFile: {
        one: '{name} stays: on {count} record from the other phone.',
        other: '{name} stays: on {count} records from the other phone.',
      },
      keptOverride: {
        one: '{name} stays, although you chose to keep them deleted: on {count} record you’re keeping.',
        other:
          '{name} stays, although you chose to keep them deleted: on {count} records you’re keeping.',
      },
      keptUnreadable:
        '{name} stays: some records here can’t be read and might name them.',
      restored:
        'This phone seems to have been restored from an older copy. Check these records: the file has changes this phone made before the restore.',
      useTheirsAll: 'Use theirs for all of these',
      conflicts: {
        one: '{count} to decide',
        other: '{count} to decide',
      },
      changedOnBoth: 'Changed on both phones',
      deletedOnOne: 'Deleted on one phone, changed on the other',
      sameHistory:
        'Both versions have the same history, so Settle can’t tell which is newer.',
      thisPhone: 'This phone',
      theFile: 'The file',
      keepMine: 'Keep mine',
      useTheirs: 'Use theirs',
      differs: 'What differs: {fields}.',
      field: {
        description: 'the description',
        amount: 'the amount',
        date: 'the date',
        category: 'the category',
        payer: 'who paid',
        split: 'the split',
        name: 'the name',
        left: 'the leaving date',
        joined: 'the joining date',
        from: 'who paid',
        to: 'who received',
        note: 'the note',
        archived: 'archived or not',
        other: 'other details',
      },
      deleted: 'Deleted',
      tooManyActive:
        'This would make more than 20 people active on {date}. Choose differently, or mark someone as left on one phone first.',
      tooManyMembers:
        'This would make more than 50 people. Choose differently, or delete someone on one phone first.',
      undecided: {
        one: 'Choose for {count} record before you apply.',
        other: 'Choose for {count} records before you apply.',
      },
      showChanges: {
        one: 'Show the {count} change',
        other: 'Show the {count} changes',
      },
      change: {
        new: 'New: {what}',
        changed: 'Changed: {what}',
        deleted: 'Deleted: {what}',
      },
      newDevice:
        'Apply also gives this phone a new id for its changes, so other phones never mix them up.',
      apply: 'Apply',
      applying: 'Applying…',
      cancel: 'Cancel',
      changedMeanwhile:
        'Your data changed while you were reviewing. Review the file again.',
      reviewAgain: 'Review again',
      failed: 'The file couldn’t be applied. Nothing was written.',
    },
    describe: {
      expense: '{description}, {amount}, {date}, paid by {payer}',
      payment: '{paid} {amount}, {date}',
      memberLeft: '{name}, left on {date}',
      householdArchived: '{name}, archived',
    },
    done: {
      title: 'Done',
      household: '{name} now has {expenses}.',
      open: 'Open {name}',
      nothing: 'Done. Nothing needed changing.',
    },
  },
} as const
