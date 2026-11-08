// Узбекский поверх русского, как в макете: русский — исходный текст, узбекский — слой над текстом и подписями.
// Словарь взят из макета Davra и дополнен нашими текстами. Чего нет в словаре, остается по-русски
// (например, ответы Claude и числа из API, которых нет в словаре).

const UZ: Record<string, string> = {
"Почему победил этот продавец?": "Nega aynan shu sotuvchi g‘olib?",
"объясняет Davra": "Davra tushuntiradi",
"Почему 2,5%, а не 10%?": "Nega 10% emas, 2,5%?",
"Последние ставки, сум/кг": "Oxirgi takliflar, so‘m/kg",
"Zarafshon Don · 99% без срывов": "Zarafshon Don · 99% uzilishsiz",
"Toshkent Un · вышел": "Toshkent Un · chiqdi",
"Buxoro Grain · вышел": "Buxoro Grain · chiqdi",
"Navoiy Tegirmon · вышел": "Navoiy Tegirmon · chiqdi",
"Дешевле всех и без срывов. Это на 3% ниже средней цены на бирже, и цена одна для всех в пуле.": "Hammadan arzon va uzilishsiz. Bu birjadagi o‘rtacha narxdan 3% past, narx esa puldagi hamma uchun bir xil.",
"Максимальный задаток": "Eng katta zakalat",
"14 сделок без срывов": "Uzilishsiz 14 ta bitim",
"3 года без долгов по налогам": "3 yil soliq qarzisiz",
"Бизнесу 4 года": "Biznes 4 yillik",
"Задержка оплаты в августе": "Avgustda to‘lov kechikkan",
"Ваш задаток": "Sizning zakalatingiz",
"Ещё 3 сделки без задержек — и будет 2%.": "Yana 3 ta kechikishsiz bitim — va 2% bo‘ladi.",
"Мельница, Самарканд": "Tegirmon, Samarqand",
"Мелькомбинат, Ташкент": "Un kombinati, Toshkent",
"Зерно и мука, Бухара": "Don va un, Buxoro",
"Мельница, Навои": "Tegirmon, Navoiy",
"Понял! Вот ваша заявка на языке биржи:": "Tushundim! Mana arizangiz birja tilida:",
"Ваша заявка": "Sizning arizangiz",
"Самарканд, склад «Север»": "Samarqand, «Shimol» ombori",
"до 4 600 сум/кг — как вы обычно покупаете": "4 600 so‘m/kg gacha — odatdagidek",
"На бирже продают целыми вагонами по 60 т — одному бизнесу столько не нужно. Я нашёл 36 пекарен, которым нужно то же самое. Скинемся на вагон вместе? Это разовая закупка, после поставки пул закроется.": "Birjada butun vagon — 60 t sotiladi, bitta biznesga buncha kerak emas. Xuddi shu narsa kerak bo‘lgan 36 ta nonvoyxonani topdim. Vagonni birga olamizmi? Bu bir martalik xarid, yetkazib berilgach pul yopiladi.",
"Да, показать пул": "Ha, pulni ko‘rsatish",
"Вагон собран: 41 участник. Торги начнутся сами.": "Vagon yig‘ildi: 41 ishtirokchi. Savdo o‘zi boshlanadi.",
"Ваша цена, примерно": "Sizning narxingiz, taxminan",
"Средняя цена на бирже в октябре": "Oktabrda birjadagi o‘rtacha narx",
"Скидка за большой объём, 3%": "Katta hajm uchun chegirma, 3%",
"Ваша цена": "Sizning narxingiz",
"В магазинах Самарканда — 5 200 сум/кг. Точную цену покажут торги.": "Samarqand do‘konlarida — 5 200 so‘m/kg. Aniq narxni savdo ko‘rsatadi.",
"Зависит от вашего рейтинга": "Reytingingizga bog‘liq",
"Вступить в пул": "Pulga qo‘shilish",
"4 продавца снижают цену": "4 ta sotuvchi narxni tushirmoqda",
"Цена для всех в пуле": "Puldagi hamma uchun narx",
"За вагон боролись 4 продавца. Трое вышли, когда цена стала им невыгодной.": "Vagon uchun 4 ta sotuvchi kurashdi. Narx foydasiz bo‘lganda uchtasi chiqib ketdi.",
"Это на 3% дешевле, чем в среднем на бирже в октябре.": "Bu oktabrdagi o‘rtacha birja narxidan 3% arzon.",
"213 000 сум хранятся у биржи": "213 000 so‘m birjada saqlanadi",
"Оплата на защищённый счёт": "Himoyalangan hisobga to‘lov",
"8 520 000 сум. Продавец получит их, только когда вы заберёте муку.": "8 520 000 so‘m. Sotuvchi ularni faqat siz unni olganingizdan keyin oladi.",
"Доставка на склад": "Omborga yetkazish",
"Вагон едет на склад. Davra разделит муку на всех и скажет, когда забрать.": "Vagon omborga ketmoqda. Davra unni hammaga bo‘lib, qachon olib ketishni aytadi.",
"Получение": "Qabul qilish",
"Проверьте вес и качество, когда заберёте.": "Olganingizda og‘irlik va sifatni tekshiring.",
"Забрал, всё ок": "Oldim, hammasi joyida",
"Готово": "Tayyor",
"Продавец получает деньги, вам возвращается задаток.": "Sotuvchi pulni oladi, sizga zakalat qaytadi.",
"Склад «Самарканд-Север», 22 ноября": "«Samarqand-Shimol» ombori, 22-noyabr",
"Сделка № P-2611-0417 · деньги заморожены · ответ до 48 часов": "Bitim № P-2611-0417 · pul muzlatilgan · javob 48 soat ichida",
"Что известно": "Nima ma’lum",
"Не хватает 60 кг": "60 kg yetishmaydi",
"По документам продавца": "Sotuvchi hujjatlari bo‘yicha",
"Взвесили на складе": "Omborda tortildi",
"Ваши фото мешков": "Qoplar rasmlaringiz",
"Проверка": "Tekshiruv",
"Что проверил Davra": "Davra nimani tekshirdi",
"Остальные 40 покупателей получили всё полностью": "Qolgan 40 xaridor hammasini to‘liq oldi",
"Продавец не в сговоре с другими продавцами": "Sotuvchi boshqa sotuvchilar bilan til biriktirmagan",
"У «Zarafshon Don» всего 1 спор за год": "«Zarafshon Don»da bir yilda atigi 1 ta nizo",
"Не хватает только у вас — скорее всего, ошиблись при делении на складе": "Faqat sizda yetishmaydi — ehtimol, omborda bo‘lishda xato qilingan",
"Предложение Davra · окончательно решает человек-арбитр": "Davra taklifi · yakuniy qarorni arbitr (inson) qabul qiladi",
"Вернуть вам 255 600 сум за недостающие 60 кг, остальное — продавцу. Продавец не виноват: ошибся склад, он и покроет разницу.": "Yetishmagan 60 kg uchun 255 600 so‘mni sizga qaytarish, qolgani — sotuvchiga. Sotuvchi aybdor emas: ombor xato qilgan, farqni o‘zi qoplaydi.",
"Согласен": "Roziman",
"Позвать арбитра": "Arbitrni chaqirish",
"Арбитр-человек всё проверит и ответит до 48 часов. Деньги пока заморожены.": "Arbitr (inson) hammasini tekshirib, 48 soat ichida javob beradi. Pul hozircha muzlatilgan.",
"Спор открыт. Деньги заморожены, пока не решим.": "Nizo ochildi. Hal bo‘lguncha pul muzlatilgan.",
"Спор закрыт: вам вернули деньги за 60 кг.": "Nizo yopildi: 60 kg uchun pul qaytarildi.",
"Спор у арбитра, ответ до 48 часов.": "Nizo arbitrda, javob 48 soat ichida.",
"8 520 000 сум на защищённый счёт": "8 520 000 so‘m himoyalangan hisobga",
"Согласитесь с Davra или позовите арбитра": "Davra bilan rozi bo‘ling yoki arbitrni chaqiring",
"Ответ до 48 часов": "Javob 48 soat ichida",
"Задаток 213 000 сум, успейте до 20 ноября": "Zakalat 213 000 so‘m, 20-noyabrgacha ulguring",
"Пишите или говорите как удобно, на узбекском или русском. Davra сам переведёт на язык биржи.": "Qulay usulda yozing yoki gapiring, o‘zbek yoki rus tilida. Davra o‘zi birja tiliga o‘giradi.",
"Найти": "Topish",
"Торги начнутся сами — можно закрыть страницу и вернуться позже.": "Savdo o‘zi boshlanadi — sahifani yopib, keyinroq qaytishingiz mumkin.",
"8 520 000 сум": "8 520 000 so‘m",
"за ваши 2 т": "sizning 2 t uchun",
"1 880 000 сум": "1 880 000 so‘m",
"экономия — на 18% дешевле, чем в магазине": "tejov — do‘kondagidan 18% arzon",
"На 18% дешевле": "18% arzon",
", чем в магазине": ", do‘kondagidan",
"Цель": "Maqsad",
"Продавцы на торгах": "Savdodagi sotuvchilar",
"4 продавца · ставки снижаются": "4 ta sotuvchi · narxlar pasaymoqda",
"6 раундов · 30 мин": "6 raund · 30 daq",
"Что нужно сделать": "Nima qilish kerak",
"Всё сделано. Когда по заявке понадобится ваше действие, оно появится здесь.": "Hammasi bajarilgan. Ariza bo‘yicha harakatingiz kerak bo‘lsa, shu yerda paydo bo‘ladi.",
"Ответьте по спору": "Nizo bo‘yicha javob bering",
"Примите решение ИИ или передайте арбитру": "SI qarorini qabul qiling yoki arbitrga topshiring",
"Спор у арбитра": "Nizo arbitrda",
"Решение придёт до 48 часов": "Qaror 48 soat ichida keladi",
"Подтвердите получение": "Qabulni tasdiqlang",
"Хаб «Самарканд-Север», 22 ноября": "«Samarqand-Shimol» habi, 22-noyabr",
"Оплатите сделку": "Bitimni to‘lang",
"8 520 000 сум, деньги ждут в эскроу": "8 520 000 so‘m, pul eskrouda kutmoqda",
"Торги начнутся сами": "Savdo o‘zi boshlanadi",
"Пул собран, делать ничего не нужно": "Pul yig‘ildi, hech narsa qilish shart emas",
"Вступите в пул": "Pulga qo‘shiling",
"Задаток 213 000 сум, сбор до 20 ноября": "Zakalat 213 000 so‘m, yig‘ish 20-noyabrgacha",
"Экономия": "Tejaldi",
"Как посчитано": "Qanday hisoblangan",
"Биржевая цена, октябрь": "Birja narxi, oktabr",
"Скидка за вагон, 3%": "Vagon uchun chegirma, 3%",
"Ожидаемая цена": "Kutilayotgan narx",
"Розница в Самарканде — 5 200 сум/кг. Итог определят торги.": "Samarqandda chakana narx — 5 200 so‘m/kg. Yakuniy narxni savdo belgilaydi.",
"4 260 сум/кг": "4 260 so‘m/kg",
"за 2 т": "2 t uchun",
"Ход торгов": "Savdo jarayoni",
"Торги запустятся сами — страницу можно закрыть.": "Savdo o‘zi boshlanadi — sahifani yopsangiz bo‘ladi.",
"До конца": "Tugashiga",
"Длились": "Davomiyligi",
"По рейтингу надёжности": "Ishonchlilik reytingi bo‘yicha",
"Ваши 2 т ≈ 8 520 000 сум": "Sizning 2 t ≈ 8 520 000 so‘m",
"Розница в Самарканде: 5 200 сум/кг.": "Samarqandda chakana narx: 5 200 so‘m/kg.",
"Это на 3% ниже средней биржевой цены за октябрь.": "Bu oktabrdagi o‘rtacha birja narxidan 3% past.",
"Сообщение для Davra": "Davraga xabar",
"Рейтинг вырос до 84": "Reyting 84 gacha oshdi",
"Отличная работа! Сделка прошла без срывов, поэтому задаток в следующих пулах теперь 2,3% вместо 2,5%.": "Ajoyib ish! Bitim uzilishsiz o‘tdi, shuning uchun keyingi pullarda zakalat endi 2,5% o‘rniga 2,3%.",
"Понятно": "Tushunarli",
"Рейтинг вырос: 82 → 84": "Reyting oshdi: 82 → 84",
"Задаток в следующих пулах — 2,3% вместо 2,5%.": "Keyingi pullarda zakalat — 2,5% o‘rniga 2,3%.",
"Отличная работа! Сделка без срывов делает ваш вход на биржу ещё дешевле.": "Ajoyib ish! Uzilishsiz bitim birjaga kirishingizni yanada arzonlashtiradi.",
"Закрыть": "Yopish",
"Без риска.": "Xavfsiz.",
"Пул не соберётся до 20 ноября — задаток вернётся. Кто-то не заплатит — вы всё равно получите муку.": "Pul 20-noyabrgacha yig‘ilmasa — zakalat qaytadi. Kimdir to‘lamasa — siz baribir unni olasiz.",
"Задаток защищён": "Zakalat himoyalangan",
"Пул не соберётся до 20 ноября — задаток вернётся полностью.": "Pul 20-noyabrgacha yig‘ilmasa — zakalat to‘liq qaytariladi.",
"Кто-то не заплатит после торгов — его задаток уйдёт в страховой фонд пула, а вы всё равно получите муку.": "Kimdir savdodan keyin to‘lamasa — uning zakalati pulning sug‘urta fondiga o‘tadi, siz esa baribir unni olasiz.",
"Заявки": "Arizalar",
"Здесь будут ваши заявки. Каждая хранит переписку с ИИ и показывает, на каком она этапе.": "Arizalaringiz shu yerda bo‘ladi. Har biri SI bilan yozishmani saqlaydi va qaysi bosqichda ekanini ko‘rsatadi.",
"Меню и заявки": "Menyu va arizalar",
"Пул собран": "Pul yig‘ildi",
"Оплата": "To‘lov",
"Завершена": "Yakunlangan",
"Продолжить": "Davom ettirish",
"Обновил заявку:": "Arizani yangiladim:",
"Остальное без изменений, пул тот же.": "Qolgani o‘zgarmadi, pul o‘sha.",
"Не понял, что поменять. Напишите, например, новый объём, срок или бюджет.": "Nimani o‘zgartirishni tushunmadim. Masalan, yangi hajm, muddat yoki byudjetni yozing.",
"Объём 3 т": "Hajm 3 t",
"Срок до 30 ноября": "Muddat 30-noyabrgacha",
"Бюджет до 4 500 сум/кг": "Byudjet 4 500 so‘m/kg gacha",
"Что поменять в заявке?": "Arizada nimani o‘zgartiramiz?",
"ИИ": "SI",
"Отправить": "Yuborish",
"Завершены": "Yakunlandi",
"Победитель": "G‘olib",
"Победитель торгов": "Savdo g‘olibi",
"Итоговая цена для всех": "Hamma uchun yakuniy narx",
"к бирже за октябрь": "oktabrdagi birja narxiga nisbatan",
"сум за ваши 2 т": "so‘m — sizning 2 t uchun",
"Почему победил этот продавец": "Nega aynan shu sotuvchi g‘olib",
"· объясняет ИИ": "· SI tushuntiradi",
"За вагон боролись 4 продавца, двое вышли, когда цена стала ниже их себестоимости.": "Vagon uchun 4 ta sotuvchi kurashdi, narx tannarxidan pastga tushganda ikkitasi chiqib ketdi.",
"У «Zarafshon Don» самая низкая цена и 99% поставок без срывов.": "«Zarafshon Don»da eng past narx va yetkazib berishlarning 99% uzilishsiz.",
"Заявка": "Ariza",
"Пул и задаток": "Pul va zakalat",
"Торги": "Savdo",
"Сделка": "Bitim",
"Спор": "Nizo",
"Черновики": "Qoralamalar",
"Новая заявка": "Yangi ariza",
"Незавершённые заявки сохраняются здесь, когда вы начинаете новую.": "Yangi ariza boshlaganingizda tugallanmagan arizalar shu yerda saqlanadi.",
"Пекарня «Non Uyi»": "«Non Uyi» nonvoyxonasi",
"Самарканд": "Samarqand",
"Что нужно вашему бизнесу?": "Biznesingizga nima kerak?",
"Найти решение": "Yechim topish",
"Своими словами, текстом или голосом, на узбекском или русском. Коды товаров знать не нужно.": "O‘z so‘zlaringiz bilan, matn yoki ovoz orqali, o‘zbek yoki rus tilida. Tovar kodlarini bilish shart emas.",
"Говорите своими словами, на узбекском или русском": "O‘z so‘zlaringiz bilan gapiring, o‘zbek yoki rus tilida",
"Assalomu alaykum! Что нужно вашему бизнесу? Можно на узбекском или русском, текстом или голосом.": "Assalomu alaykum! Biznesingizga nima kerak? O‘zbek yoki rus tilida, matn yoki ovoz bilan yozishingiz mumkin.",
"ИИ-агент": "SI-agent",
"Понял. Вот как это выглядит на языке биржи:": "Tushundim. Birja tilida bu shunday ko‘rinadi:",
"Заявка-потребность": "Ehtiyoj arizasi",
"Товар": "Tovar",
"Мука пшеничная, высший сорт, ГОСТ 26574": "Bug‘doy uni, oliy nav, GOST 26574",
"Объём": "Hajm",
"2 т, разовая закупка": "2 t, bir martalik xarid",
"Доставка": "Yetkazib berish",
"Самарканд, хаб «Север»": "Samarqand, «Shimol» habi",
"Нужно до": "Qachongacha",
"25 ноября": "25-noyabr",
"Бюджет": "Byudjet",
"до 4 600 сум/кг, по вашей истории закупок": "4 600 so‘m/kg gacha, xaridlar tarixingiz bo‘yicha",
"Один вагон на бирже — 60 т, вам столько не нужно. Но я нашёл пул из 36 покупателей с той же потребностью. Это разовая закупка: пул собирается под одну поставку и закрывается после неё. Присоединиться?": "Birjada bir vagon — 60 t, sizga buncha kerak emas. Lekin men xuddi shunday ehtiyojli 36 xaridordan iborat pul topdim. Bu bir martalik xarid: pul bitta yetkazib berish uchun yig‘iladi va undan keyin yopiladi. Qo‘shilasizmi?",
"Всё верно, показать пул": "Hammasi to‘g‘ri, pulni ko‘rsatish",
"Изменить": "O‘zgartirish",
"Мука пшеничная в/с": "Bug‘doy uni, oliy nav",
"Пул пекарен и кондитерских · Самарканд · сбор до 20 ноября": "Nonvoyxona va qandolatxonalar puli · Samarqand · yig‘ish 20-noyabrgacha",
"Собирается": "Yig‘ilmoqda",
"Собран": "Yig‘ildi",
"из 60 т": "60 t dan",
"Участников": "Ishtirokchilar",
"Лот": "Lot",
"вагон": "vagon",
"Осталось собрать": "Yig‘ish kerak",
"До закрытия сбора": "Yig‘ish yopilishiga",
"дня": "kun",
"Другие": "Boshqalar",
"Ваши 2 т": "Sizning 2 t",
"Свободно": "Bo‘sh",
"Пул собран: 60 из 60 т, 41 участник. Биржа запустит торги автоматически.": "Pul yig‘ildi: 60 t dan 60 t, 41 ishtirokchi. Birja savdoni avtomatik boshlaydi.",
"Ожидаемая цена для вас": "Siz uchun kutilayotgan narx",
"сум/кг": "so‘m/kg",
"к рознице": "chakana narxga nisbatan",
"(5 200 сум/кг в Самарканде)": "(Samarqandda 5 200 so‘m/kg)",
"Ваши 2 т ≈ 8 520 000 сум вместо 10 400 000 сум": "Sizning 2 t ≈ 10 400 000 so‘m o‘rniga 8 520 000 so‘m",
"Откуда эта цифра": "Bu raqam qayerdan",
"Средняя биржевая цена муки в/с за октябрь: 4 390 сум/кг.": "Oktabrda oliy nav unning o‘rtacha birja narxi: 4 390 so‘m/kg.",
"За полный вагон продавцы дают скидку 2–4% за объём.": "To‘liq vagon uchun sotuvchilar hajm bo‘yicha 2–4% chegirma beradi.",
"4 проверенных продавца уже подтвердили участие.": "4 ta tekshirilgan sotuvchi ishtirokini tasdiqladi.",
"Итоговую цену определят торги, а не ИИ.": "Yakuniy narxni SI emas, savdo belgilaydi.",
"213 000 сум": "213 000 so‘m",
"Рейтинг надёжности": "Ishonchlilik reytingi",
"Почему 2,5%, а не 10%": "Nega 10% emas, 2,5%",
"Налоги без долгов 3 года": "3 yildan beri soliq qarzi yo‘q",
"Бизнесу 4 года, обороты стабильны": "Biznes 4 yillik, aylanmasi barqaror",
"Одна задержка оплаты в августе": "Avgustda bitta to‘lov kechikkan",
"Ещё 3 сделки без задержек, и задаток станет 2%.": "Yana 3 ta kechikishsiz bitim — va zakalat 2% bo‘ladi.",
"Если пул не соберётся до 20 ноября, задаток вернётся полностью. Если участник откажется платить после торгов, его задаток уходит в страховой фонд пула, и остальные получают свою муку.": "Agar pul 20-noyabrgacha yig‘ilmasa, zakalat to‘liq qaytariladi. Agar ishtirokchi savdodan keyin to‘lashdan bosh tortsa, uning zakalati pulning sug‘urta fondiga o‘tadi, qolganlar esa o‘z unini oladi.",
"Внести задаток и вступить": "Zakalat kiritib qo‘shilish",
"Задаток внесён": "Zakalat kiritildi",
"Перейти к торгам": "Savdoga o‘tish",
"Старт через": "Boshlanishiga",
"Лучшая цена, сум/кг": "Eng yaxshi narx, so‘m/kg",
"Раунд": "Raund",
"из 6": "6 dan",
"Запланированы": "Rejalashtirilgan",
"Старт · автоматически": "Boshlanish · avtomatik",
"30 мин · 6 раундов по 5 мин": "30 daq · 5 daqiqalik 6 raund",
"Торги запускает биржа сама, как только пул собран. Делать ничего не нужно: можно закрыть страницу, итог придёт уведомлением.": "Pul yig‘ilishi bilan birja savdoni o‘zi boshlaydi. Hech narsa qilish shart emas: sahifani yopishingiz mumkin, natija bildirishnoma bilan keladi.",
"К торгам пулов допускаются продавцы с рейтингом от": "Pul savdolariga qo‘yiladigan minimal reyting:",
"рейтинг": "reyting",
"Идут торги": "Savdo ketmoqda",
"До конца торгов": "Savdo tugashiga",
"Торги идут. Каждый раунд длится 5 минут, продавцы могут только снижать цену.": "Savdo ketmoqda. Har bir raund 5 daqiqa, sotuvchilar narxni faqat pasaytira oladi.",
"мин": "daq",
"вышел": "chiqdi",
"Торги длились": "Savdo davomiyligi",
"Торги завершены автоматически после 6-го раунда.": "Savdo 6-raunddan keyin avtomatik yakunlandi.",
"Завершены · победил Zarafshon Don": "Yakunlandi · Zarafshon Don g‘olib",
"ИИ объясняет, как сложилась цена 4 260 сум/кг": "SI 4 260 so‘m/kg narx qanday shakllanganini tushuntiradi",
"За вагон боролись 4 продавца. Двое вышли, когда цена стала ниже их себестоимости.": "Vagon uchun 4 ta sotuvchi kurashdi. Narx tannarxidan pastga tushganda ikkitasi chiqib ketdi.",
"Победил «Zarafshon Don»: самая низкая цена и 99% поставок без срывов.": "«Zarafshon Don» g‘olib bo‘ldi: eng past narx va yetkazib berishlarning 99% uzilishsiz.",
"Это на 18% ниже розницы и на 3% ниже средней биржевой цены за октябрь.": "Bu chakana narxdan 18%, oktabrdagi o‘rtacha birja narxidan 3% past.",
"Одна цена для всех: пекарня с 1 т платит за кг столько же, сколько с 5 т.": "Hamma uchun bitta narx: 1 t olgan nonvoyxona ham, 5 t olgan ham 1 kg uchun bir xil to‘laydi.",
"К сделке": "Bitimga o‘tish",
"Сделка № P-2611-0417": "Bitim № P-2611-0417",
"Мука пшеничная в/с, 2 т": "Bug‘doy uni, oliy nav, 2 t",
"Цена": "Narx",
"Сумма": "Summa",
"Продавец": "Sotuvchi",
"ООО «Zarafshon Don»": "«Zarafshon Don» MChJ",
"АО «Toshkent Un»": "«Toshkent Un» AJ",
"ООО «Buxoro Grain»": "«Buxoro Grain» MChJ",
"ЧП «Navoiy Tegirmon»": "«Navoiy Tegirmon» XK",
"Задаток заморожен": "Zakalat muzlatildi",
"213 000 сум на счёте биржи": "213 000 so‘m birja hisobida",
"Оплата в эскроу": "Eskrouga to‘lov",
"8 520 000 сум. Продавец видит деньги, но не может их получить.": "8 520 000 so‘m. Sotuvchi pulni ko‘radi, lekin ololmaydi.",
"Оплатить через банк": "Bank orqali to‘lash",
"Отгрузка и деление партии": "Jo‘natish va partiyani bo‘lish",
"Вагон идёт на хаб. ИИ делит 60 т на 41 получателя и назначает время вывоза.": "Vagon habga ketmoqda. SI 60 t ni 41 oluvchiga bo‘ladi va olib ketish vaqtini belgilaydi.",
"Подтверждение получения": "Qabulni tasdiqlash",
"Проверьте вес и качество на хабе.": "Habda og‘irlik va sifatni tekshiring.",
"Получил, всё в порядке": "Oldim, hammasi joyida",
"Открыть спор": "Nizo ochish",
"Расчёт": "Hisob-kitob",
"Деньги уходят продавцу, задаток возвращается вам.": "Pul sotuvchiga o‘tadi, zakalat sizga qaytadi.",
"8 520 000 сум переведены продавцу. Задаток 213 000 сум вернулся на ваш счёт.": "8 520 000 so‘m sotuvchiga o‘tkazildi. 213 000 so‘m zakalat hisobingizga qaytdi.",
"Ваш рейтинг вырос": "Reytingingiz oshdi",
"было 82": "avval 82",
"Задаток в следующих пулах: 2,3% вместо 2,5%. Честная работа делает вход на биржу дешевле.": "Keyingi pullarda zakalat: 2,5% o‘rniga 2,3%. Halol ish birjaga kirishni arzonlashtiradi.",
"Спор по сделке № P-2611-0417": "P-2611-0417-sonli bitim bo‘yicha nizo",
"Спор открыт": "Nizo ochildi",
"Сделка № P-2611-0417 · деньги в эскроу · решение до 48 часов": "Bitim № P-2611-0417 · pul eskrouda · qaror 48 soat ichida",
"Доказательства": "Dalillar",
"Недовес 60 кг": "60 kg kam tortilgan",
"Накладная продавца": "Sotuvchining yuk xati",
"2 000 кг": "2 000 kg",
"1 940 кг": "1 940 kg",
"Вес на хабе при выдаче": "Habda berishdagi og‘irlik",
"Ваши фото мешков при приёмке": "Qabuldagi qop rasmlaringiz",
"6 фото": "6 ta rasm",
"Сертификат качества": "Sifat sertifikati",
"в норме": "me’yorda",
"Контроль сделки": "Bitim nazorati",
"Проверка ИИ": "SI tekshiruvi",
"Остальные 40 получателей вагона подтвердили вес": "Vagonning qolgan 40 oluvchisi og‘irlikni tasdiqladi",
"Продавец не связан с другими участниками торгов": "Sotuvchi boshqa savdo ishtirokchilari bilan bog‘liq emas",
"У «Zarafshon Don» 1 спор за 12 месяцев": "«Zarafshon Don»da 12 oyda 1 ta nizo",
"Недовес только в вашей партии: вероятно, ошибка при делении на хабе": "Kam tortish faqat sizning partiyangizda: ehtimol, habda bo‘lishda xato bo‘lgan",
"Решение ИИ · последнее слово за арбитром биржи": "SI qarori · so‘nggi so‘z birja arbitrida",
"Вернуть вам 255 600 сум за 60 кг из эскроу, остальные 8 264 400 сум перевести продавцу. Рейтинг продавца не снижается: ошибка произошла на хабе, хаб компенсирует недовес.": "Eskroudan 60 kg uchun 255 600 so‘mni sizga qaytarish, qolgan 8 264 400 so‘mni sotuvchiga o‘tkazish. Sotuvchi reytingi pasaymaydi: xato habda bo‘lgan, kamomadni hab qoplaydi.",
"Принять решение": "Qarorni qabul qilish",
"Передать арбитру": "Arbitrga topshirish",
"Решение принято.": "Qaror qabul qilindi.",
"255 600 сум вернутся вам вместе с задатком, продавец получит 8 264 400 сум.": "255 600 so‘m zakalat bilan birga sizga qaytadi, sotuvchi 8 264 400 so‘m oladi.",
"Передано арбитру.": "Arbitrga topshirildi.",
"Человек-арбитр изучит доказательства, решение придёт до 48 часов. Деньги остаются в эскроу.": "Arbitr (inson) dalillarni o‘rganadi, qaror 48 soat ichida keladi. Pul eskrouda qoladi.",
"Вернуться к сделке": "Bitimga qaytish",
"Спор закрыт решением ИИ: возврат за 60 кг.": "Nizo SI qarori bilan yopildi: 60 kg uchun qaytarish.",
"8 264 400 сум переведены продавцу. 255 600 сум и задаток 213 000 сум вернулись на ваш счёт.": "8 264 400 so‘m sotuvchiga o‘tkazildi. 255 600 so‘m va 213 000 so‘m zakalat hisobingizga qaytdi.",
"Спор открыт. Деньги заморожены в эскроу до решения.": "Nizo ochildi. Qarorgacha pul eskrouda muzlatilgan.",
"Спор у арбитра биржи, решение до 48 часов.": "Nizo birja arbitrida, qaror 48 soat ichida.",
"Davra, на главную": "Davra, bosh sahifa",
"Готово, распознать": "Tayyor, aniqlash",
"Закрыть меню": "Menyuni yopish",
"Заявки и черновики": "Arizalar va qoralamalar",
"Меню и черновики": "Menyu va qoralamalar",
"Отменить запись": "Yozuvni bekor qilish",
"Сказать голосом": "Ovoz bilan aytish",
"Что нужно вашему бизнесу": "Biznesingizga nima kerak",
"Шаги сделки": "Bitim bosqichlari",
"ИИ печатает": "SI yozmoqda",
"Распознаю…": "Aniqlanmoqda…",
"Язык интерфейса": "Interfeys tili",
"Агент биржи · по вашим закупкам": "Birja agenti · xaridlaringiz bo‘yicha",
"Собрать заявку": "Ariza tuzish",
"Не сейчас": "Hozir emas",
"Сбросить демо": "Demoni qayta boshlash",
"Ваш ответ": "Javobingiz",
"К какому числу нужна поставка? Если срок не важен, так и напишите.": "Yetkazib berish qaysi sanagacha kerak? Muddat muhim bo‘lmasa, shunday yozing.",
"Сколько нужно? Можно в тоннах или килограммах.": "Qancha kerak? Tonna yoki kilogrammda yozishingiz mumkin.",
"Какой товар нужен? Сейчас в демо на бирже есть мука.": "Qanday tovar kerak? Hozir demoda birjada un bor.",
"Эта дата уже прошла. К какому числу нужна поставка?": "Bu sana o‘tib ketgan. Yetkazib berish qaysi sanagacha kerak?",
"К пулу": "Pulga",
"К спору": "Nizoga",
"Светлая тема": "Yorug‘ mavzu",
"Тёмная тема": "Qorong‘i mavzu",
"Загружаю пул…": "Pul yuklanmoqda…",
"Загружаю торги…": "Savdo yuklanmoqda…",
"Загружаю сделку…": "Bitim yuklanmoqda…",
"Загружаю спор…": "Nizo yuklanmoqda…",
"Повторить": "Qayta urinish"
}

const UZR: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/^Черновик · (.+) · (\d{1,2}:\d{2})$/, (m: RegExpMatchArray) => "Qoralama · " + tr(m[1]) + " · " + m[2]],
    [/^(.+) · (\d{1,2}:\d{2})$/, (m: RegExpMatchArray) => tr(m[1]) + " · " + m[2]],
    [/^(\d[\d\s,]*) т$/, (m: RegExpMatchArray) => m[1] + " t"],
    [/^(\d+(?:,\d+)?) т, разовая закупка$/, (m: RegExpMatchArray) => m[1] + " t, bir martalik xarid"],
    [/^(\d{1,2}) ноября$/, (m: RegExpMatchArray) => m[1] + "-noyabr"],
    [/^(\d{1,2}) декабря$/, (m: RegExpMatchArray) => m[1] + "-dekabr"],
    [/^до ([\d\s]+) сум\/кг$/, (m: RegExpMatchArray) => m[1] + " so‘m/kg gacha"],
    [/^(\d+)% без срывов$/, (m: RegExpMatchArray) => m[1] + "% uzilishsiz"],
    [/^Пул заполнен на (\d+) из 60 тонн$/, (m: RegExpMatchArray) => "Pul 60 tonnadan " + m[1] + " tonnaga to‘ldi"],
    [/^рейтинг ([\d,]+) из (\d+)$/, (m: RegExpMatchArray) => "reyting " + m[1] + " / " + m[2]],
    [/^Ждут вас: (\d+)$/, (m: RegExpMatchArray) => "Sizni kutmoqda: " + m[1]],
    [/^Что нужно сделать, (\d+)$/, (m: RegExpMatchArray) => "Nima qilish kerak, " + m[1]],
    [/^([\d,]+) млн сум$/, (m: RegExpMatchArray) => m[1] + " mln so‘m"],
    [/^Экономия ([\d,]+) млн сум$/, (m: RegExpMatchArray) => "Tejaldi " + m[1] + " mln so‘m"],
    [/^(\d+) мин$/, (m: RegExpMatchArray) => m[1] + " daq"],
    [/^Все (\d+)$/, (m: RegExpMatchArray) => "Hammasi " + m[1]],
    [/^Удалить заявку: (.+)$/, (m: RegExpMatchArray) => "Arizani o‘chirish: " + m[1]],
    [/^Меню и заявки, (\d+)$/, (m: RegExpMatchArray) => "Menyu va arizalar, " + m[1]]
  ]

function tr(s: string): string {
  if (UZ[s]) return UZ[s]
  for (const [re, f] of UZR) {
    const m = s.match(re)
    if (m) return f(m)
  }
  return s
}

export type Lang = 'ru' | 'uz'
const ATTRS = ['aria-label', 'placeholder']
// Что мы перевели: узел -> [русский текст, узбекский]. Если React потом поменял текст, оригинал не возвращаем.
const texts = new Map<Text, [string, string]>()
const attrs = new Map<Element, Record<string, [string, string]>>()
let lang: Lang = 'ru'
let observer: MutationObserver | null = null

function trText(n: Text) {
  const known = texts.get(n)
  if (known && n.data === known[1]) return
  const raw = n.data
  const t = raw.trim()
  if (!t) return
  const u = tr(t)
  if (u === t) return
  const next = raw.replace(t, u)
  texts.set(n, [raw, next])
  n.data = next
}

function trAttr(el: Element, a: string) {
  const v = el.getAttribute(a)
  if (v == null) return
  const known = attrs.get(el)?.[a]
  if (known && v === known[1]) return
  const u = tr(v)
  if (u === v) return
  attrs.set(el, { ...(attrs.get(el) ?? {}), [a]: [v, u] })
  el.setAttribute(a, u)
}

function translate(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return trText(root as Text)
  if (root.nodeType !== Node.ELEMENT_NODE) return
  const el = root as Element
  if (el.closest('script,style')) return
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let n: Node | null
  while ((n = w.nextNode())) trText(n as Text)
  for (const x of [el, ...Array.from(el.querySelectorAll('[aria-label],[placeholder]'))]) for (const a of ATTRS) if (x.hasAttribute(a)) trAttr(x, a)
}

function restore() {
  for (const [n, [ru, uz]] of texts) if (n.data === uz) n.data = ru
  for (const [el, map] of attrs) for (const a in map) if (el.getAttribute(a) === map[a][1]) el.setAttribute(a, map[a][0])
  texts.clear()
  attrs.clear()
}

export function setLang(next: Lang) {
  if (next === lang) return
  if (lang === 'uz') restore()
  lang = next
  document.documentElement.lang = next
  observer?.disconnect()
  observer = null
  if (next !== 'uz') return
  translate(document.body)
  // Новые и измененные React-ом узлы переводим на лету.
  observer = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(translate)
      else if (m.type === 'characterData') trText(m.target as Text)
      else if (m.attributeName) trAttr(m.target as Element, m.attributeName)
    }
  })
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS })
}

export function currentLang(): Lang {
  return lang
}
