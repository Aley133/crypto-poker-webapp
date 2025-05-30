// Модуль управления отрисовкой действий игрока в онлайн-покере
let preAction = null;  // хранит выбранное заранее действие ('fold' или 'call'), если игрок нажал заранее

export default function renderActions(state, userId, sendCallback) {
    const container = document.querySelector('.action-buttons-wrapper');
    if (!container) return;

    // Определяем вклад игрока (contribution) и стек (stack)
    let userContribution;
    let userStack;
    // Предполагаем, что state.contributions и state.stacks индексируются по идентификаторам игроков или по порядку сидений.
    if (Array.isArray(state.contributions) && typeof userId === 'number') {
        // Если contributions - массив, а userId - индекс
        userContribution = state.contributions[userId] || 0;
        userStack = state.stacks[userId] || 0;
    } else {
        // Иначе, если contributions - объект по ключу userId
        userContribution = state.contributions[userId] || 0;
        userStack = state.stacks[userId] || 0;
    }

    // Проверяем, является ли сейчас ход данного игрока
    const isCurrentPlayer = state.current_player === userId || state.current_player === Number(userId);

    // Если наступил ход игрока и было выбрано действие заранее, отправляем его автоматически
    if (isCurrentPlayer && preAction) {
        // Отправляем сохраненное действие и сбрасываем preAction
        sendCallback(preAction);
        preAction = null;
        // Выходим, чтобы не рисовать кнопки заново для этого хода (действие уже выполнено)
        return;
    }

    // Очищаем контейнер перед отрисовкой новых кнопок
    container.innerHTML = '';

    // Вычисляем суммы и доступность действий
    const currentBet = state.current_bet || 0;
    const toCall = Math.max(0, currentBet - userContribution);  // сумма, которую нужно уравнять для Call (если > 0)
    const canCall = toCall > 0;
    const canCheck = currentBet === userContribution;           // можно Check, если нет чужой ставки сверх вклада игрока
    const noBetYet = currentBet === 0;                          // признак, что в раунде еще не было ставок (кроме блайндов)
    // Возможность Raise: есть текущая ставка и после колла у игрока останутся фишки для повышения
    let canRaise = false;
    if (currentBet > 0) {
        // Требуется, чтобы у игрока оставались фишки сверх уравнивания ставки для Raise
        canRaise = userStack > (currentBet - userContribution);
    }
    // Возможность Bet: если в текущем раунде еще никто не делал ставку
    const canBet = noBetYet;

    // Создаем элементы кнопок действий
    const foldBtn = document.createElement('button');
    foldBtn.className = 'poker-action-btn fold';
    foldBtn.textContent = 'Fold';
    // Fold всегда доступен (можно нажать даже вне своей очереди)
    // Отмечаем заранее выбранный Fold
    if (preAction === 'fold') {
        foldBtn.classList.add('highlight');  // подсвечиваем полностью, если выбрано заранее
    }
    // Fold не дизейблим, т.к. всегда разрешен
    foldBtn.addEventListener('click', () => {
        if (!isCurrentPlayer) {
            // Ход еще не наш: фиксируем/отменяем предварительное действие Fold
            if (preAction === 'fold') {
                // Если Fold уже выбран, отменяем его
                preAction = null;
            } else {
                // Иначе устанавливаем Fold как выбранное заранее действие
                preAction = 'fold';
            }
            // Перерисовываем кнопки для обновления подсветки
            renderActions(state, userId, sendCallback);
        } else {
            // Если сейчас очередь игрока — отправляем действие сразу
            sendCallback('fold');
            // После отправки блокируем кнопки до обновления состояния игры
            container.querySelectorAll('button').forEach(btn => btn.disabled = true);
        }
    });

    const callBtn = document.createElement('button');
    callBtn.className = 'poker-action-btn call';
    callBtn.textContent = canCall ? `Call ${toCall}` : 'Call';
    // Доступность Call: если есть ставка, которую нужно уравнять
    if (isCurrentPlayer) {
        if (canCall) {
            callBtn.disabled = false;
        } else {
            // Нечего коллить — кнопка неактивна (вместо этого может быть Check)
            callBtn.disabled = true;
            callBtn.classList.add('dimmed');
        }
    } else {
        if (canCall) {
            // Не наш ход, но есть ставка -> можно заранее выбрать Call
            callBtn.disabled = false;
        } else {
            // Нет ставки и не наш ход -> Call неактивен
            callBtn.disabled = true;
            callBtn.classList.add('dimmed');
        }
    }
    // Отмечаем заранее выбранный Call
    if (preAction === 'call' && !isCurrentPlayer) {
        callBtn.classList.add('highlight');
    }
    callBtn.addEventListener('click', () => {
        if (!isCurrentPlayer) {
            // Предварительный выбор действия Call
            if (preAction === 'call') {
                preAction = null;
            } else {
                preAction = 'call';
            }
            renderActions(state, userId, sendCallback);
        } else {
            // Сейчас очередь игрока
            if (canCall) {
                sendCallback('call');
            } else {
                // Если toCall == 0, то фактически это Check
                sendCallback('check');
            }
            container.querySelectorAll('button').forEach(btn => btn.disabled = true);
        }
    });

    const checkBtn = document.createElement('button');
    checkBtn.className = 'poker-action-btn check';
    checkBtn.textContent = 'Check';
    // Check доступен только если текущая ставка равна вкладу игрока (нет чужой ставки)
    if (isCurrentPlayer) {
        if (canCheck) {
            checkBtn.disabled = false;
        } else {
            checkBtn.disabled = true;
            checkBtn.classList.add('dimmed');
        }
    } else {
        // Вне своей очереди Check неактивен
        checkBtn.disabled = true;
        checkBtn.classList.add('dimmed');
    }
    // (Предварительный Check не выбирается)
    checkBtn.addEventListener('click', () => {
        if (isCurrentPlayer && canCheck) {
            sendCallback('check');
            container.querySelectorAll('button').forEach(btn => btn.disabled = true);
        }
    });

    const betBtn = document.createElement('button');
    betBtn.className = 'poker-action-btn bet';
    betBtn.textContent = 'Bet';
    // Bet доступен, если в раунде ещё не было ставок и это ход игрока
    if (isCurrentPlayer) {
        if (canBet) {
            betBtn.disabled = false;
        } else {
            betBtn.disabled = true;
            betBtn.classList.add('dimmed');
        }
    } else {
        // Вне очереди Bet неактивен
        betBtn.disabled = true;
        betBtn.classList.add('dimmed');
    }
    // (Предварительный Bet не выбирается)
    betBtn.addEventListener('click', () => {
        if (isCurrentPlayer && canBet) {
            // Отправляем действие Bet (сумма ставки определяется отдельно)
            sendCallback('bet');
            container.querySelectorAll('button').forEach(btn => btn.disabled = true);
        }
    });

    const raiseBtn = document.createElement('button');
    raiseBtn.className = 'poker-action-btn raise';
    raiseBtn.textContent = 'Raise';
    // Raise доступен, если уже есть ставка и у игрока достаточно фишек для повышения
    if (isCurrentPlayer) {
        if (canRaise) {
            raiseBtn.disabled = false;
        } else {
            raiseBtn.disabled = true;
            raiseBtn.classList.add('dimmed');
        }
    } else {
        raiseBtn.disabled = true;
        raiseBtn.classList.add('dimmed');
    }
    // (Предварительный Raise не выбирается)
    raiseBtn.addEventListener('click', () => {
        if (isCurrentPlayer && canRaise) {
            // Отправляем действие Raise (конкретная сумма рейза выбирается дополнительно в интерфейсе)
            sendCallback('raise');
            container.querySelectorAll('button').forEach(btn => btn.disabled = true);
        }
    });

    // Добавляем все кнопки в контейнер
    container.append(foldBtn, callBtn, checkBtn, betBtn, raiseBtn);
}
