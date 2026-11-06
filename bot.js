import {createDeck,shuffle,objectToCards,cardsToObject,canPlayCard,determineTrickWinner,calculateRoundPoints,getCardColorClass,getCardImagePath,escapeHtml,renderPlayerNameHtml,renderBlindHand} from "./firebase-common.js?v=80";

const KEY="bappoSoloV2", HUMAN="human", BOT="computer", $=id=>document.getElementById(id);
const page=location.pathname.split("/").pop();
const url=target=>"./"+target+".html?solo=1&v=84";
let data;
let busy=false;
const LIMIT_MS=30*60*1000, TIME_KEY="bappoSoloDailyTimeV1";
let lastTick=Date.now(), expired=false;
function localDay(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
function timeRecord(){
    try{const record=JSON.parse(localStorage.getItem(TIME_KEY));return record?.day===localDay()?record:{day:localDay(),elapsed:0};}
    catch{return {day:localDay(),elapsed:0};}
}
function showLimit(){
    if(expired)return;
    expired=true;busy=true;
    const overlay=document.createElement("div");
    overlay.style.cssText="position:fixed;inset:0;z-index:100000;background:#082b26;color:#f5f3e9;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:25px;text-align:center;font-family:inherit";
    overlay.innerHTML='<h2 style="font-size:clamp(23px,6vw,38px);line-height:1.3">Dein Zeitlimit für das Spiel gegen einen Computer ist aufgebraucht. Mach was Sinnvolles.</h2><a href="./index.html" style="padding:12px 20px;border-radius:10px;background:#d7ae59;color:#14251b;font-weight:800;text-decoration:none">Zurück zur Startseite</a>';
    document.body.append(overlay);
}
function updateTime(){
    const now=Date.now(),record=timeRecord();
    const elapsed=Math.max(0,Math.min(now-lastTick,5000));
    lastTick=now;
    if(!document.hidden&&!expired&&record.elapsed<LIMIT_MS){
        record.elapsed=Math.min(LIMIT_MS,record.elapsed+elapsed);
        localStorage.setItem(TIME_KEY,JSON.stringify(record));
    }
    if(record.elapsed>=LIMIT_MS)showLimit();
    return !expired;
}
window.addEventListener("visibilitychange",()=>{lastTick=Date.now();updateTime();});
window.addEventListener("storage",event=>{if(event.key===TIME_KEY)updateTime();});
updateTime();
setInterval(updateTime,1000);
function save(){sessionStorage.setItem(KEY,JSON.stringify(data));}
function load(){try{return JSON.parse(sessionStorage.getItem(KEY));}catch{return null;}}
function name(){return (localStorage.getItem("kartenspielPlayerName")||sessionStorage.getItem("kartenspielPlayerName")||"Du").trim().slice(0,30);}
function newGame(){data={round:0,finished:false,scores:{[HUMAN]:{name:name(),score:0,roundPoints:0},[BOT]:{name:"Computer",score:0,roundPoints:0}}};save();}
function navigate(target){if(updateTime())location.replace(url(target));}
function card(card,button=false,disabled=false){
    const tag=button?"button":"div";
    return '<'+tag+' class="card '+(button?'':'display-card ')+getCardColorClass(card.color)+'" '+(button?'type="button" data-card-id="'+escapeHtml(card.id)+'" '+(disabled?'disabled':''):'role="img"')+' aria-label="'+escapeHtml(card.color)+' '+card.value+'"><img class="card-color-image" src="'+getCardImagePath(card.color)+'" alt="" aria-hidden="true" draggable="false"><strong>'+card.value+'</strong></'+tag+'>';
}
function score(player){return data.scores[player];}
function playerName(player){return renderPlayerNameHtml(score(player).name);}
function order(){return data.starter===HUMAN?[HUMAN,BOT]:[BOT,HUMAN];}
function startRound(){
    if(!updateTime())return;
    const deck=createDeck();shuffle(deck);
    const round=data.round+1,count=Math.floor(Math.random()*21);
    data.round=round;data.count=count;data.starter=round%2===1?HUMAN:BOT;
    data.currentTip=data.starter;data.currentPlayer=data.starter;
    data.hands={[HUMAN]:[],[BOT]:[]};data.trick=[];data.trickNumber=1;
    data.wins={[HUMAN]:0,[BOT]:0};data.tips={[HUMAN]:null,[BOT]:null};
    for(let i=0;i<count;i++)for(const p of [HUMAN,BOT])data.hands[p].push(deck.pop());
    data.singleCards=count===1?{[HUMAN]:data.hands[HUMAN][0],[BOT]:data.hands[BOT][0]}:null;
    data.status=count===0?"roundResult":"tips";data.finished=false;
    if(count===0){
        for(const p of [HUMAN,BOT]){
            score(p).roundPoints=calculateRoundPoints(0,0);
            score(p).score+=score(p).roundPoints;
        }
        save();navigate("round");return;
    }
    save();navigate("tip");
}
function botTip(){
    const cards=data.hands[BOT];
    const strong=cards.filter(c=>c.color==="Rot"?c.value>=10:c.value>=17).length;
    let tip=Math.max(0,Math.min(data.count,Math.round(strong*.75+(data.count-strong)*.18+(Math.random()-.5)*1.4)));
    if(data.starter===HUMAN&&tip+data.tips[HUMAN]===data.count)tip=tip<data.count?tip+1:tip-1;
    data.tips[BOT]=tip;data.currentTip=HUMAN;save();
}
function submitTip(){
    if(data.status!=="tips"||data.currentTip!==HUMAN||busy)return;
    if(!data.hands[HUMAN]?.length){alert("Die Karten wurden noch nicht geladen.");return;}
    const input=$("tipInput"),tip=Number(input.value);
    if(!Number.isInteger(tip)||tip<0||tip>data.count){alert("Bitte gib eine ganze Zahl von 0 bis "+data.count+" ein.");return;}
    if(data.starter===BOT&&tip+data.tips[BOT]===data.count){alert("Die Summe der Tipps darf nicht der Kartenanzahl entsprechen.");return;}
    data.tips[HUMAN]=tip;
    if(data.starter===HUMAN)botTip();
    data.status="playing";data.currentPlayer=data.starter;save();navigate("game");
}
function renderTips(){
    $("roundTitle").textContent="Runde "+data.round+": Tipp abgeben";
    $("playerDisplay").innerHTML="Du spielst als "+playerName(HUMAN)+".";
    $("currentTipPlayer").innerHTML="Jetzt tippt: <strong>"+playerName(HUMAN)+"</strong>";
    $("tipInput").max=String(data.count);
    const forbidden=data.starter===BOT?data.count-data.tips[BOT]:null;
    $("tipStatus").textContent=forbidden!==null&&forbidden>=0&&forbidden<=data.count?
        "Du bist als Letzter dran. Du darfst nicht "+forbidden+" tippen, weil die Summe aller Tipps sonst genau "+data.count+" wäre.":
        "Du bist dran. Erlaubt sind 0 bis "+data.count+" Stiche.";
    $("tipOverview").innerHTML='<div class="tip-order-list">'+order().map((p,i)=>{
        const result=data.tips[p]===null?"tippt jetzt":data.tips[p]+" Stiche";
        return '<div class="tip-order-row '+(data.tips[p]===null?'is-current':'')+'"><span class="tip-position">'+(i+1)+'</span><span class="tip-player-name">'+playerName(p)+(p===data.starter?'<small>Rundenanfänger</small>':'')+'</span><strong class="tip-value">'+escapeHtml(result)+'</strong></div>';
    }).join("")+"</div>";
    const state={cardsPerPlayer:data.count,playerOrder:[HUMAN,BOT],singleCards:data.singleCards,status:"tips"};
    const area=$("handArea"),scores={[HUMAN]:score(HUMAN),[BOT]:score(BOT)};
    if(!renderBlindHand(area,state,{uid:HUMAN},scores,cardsToObject(data.hands[HUMAN]),null)){
        area.closest("section").querySelector("h2").textContent="Deine Karten";
        area.innerHTML=objectToCards(cardsToObject(data.hands[HUMAN])).map(c=>card(c)).join("");
    }
}
function chooseBotCard(){
    const hand=data.hands[BOT],lead=data.trick[0]?.card.color;
    const valid=hand.filter(c=>canPlayCard(hand,c,lead));
    const strength=c=>(c.color==="Rot"?2000:c.color===lead?1000:0)+c.value;
    const target=data.trick[0]?.card;
    if(!target){
        const preferred=[...valid].sort((a,b)=>strength(b)-strength(a));
        return data.wins[BOT]<data.tips[BOT]?preferred[0]:preferred[preferred.length-1];
    }
    const winning=valid.filter(c=>strength(c)>strength(target)).sort((a,b)=>strength(a)-strength(b));
    if(winning.length&&data.wins[BOT]<data.tips[BOT])return winning[0];
    return [...valid].sort((a,b)=>strength(a)-strength(b))[0];
}
function renderOverview(){
    $("playerOverview").innerHTML='<div class="player-overview-grid">'+[HUMAN,BOT].map(p=>
        '<article class="player-stat '+(data.currentPlayer===p&&data.status==="playing"?'is-current':'')+'"><h3>'+playerName(p)+'</h3><div><span>Tipp</span><strong>'+data.tips[p]+'</strong></div><div><span>Stiche</span><strong>'+data.wins[p]+'</strong></div></article>'
    ).join("")+"</div>";
}
function renderTrick(){
    const panel=$("trickPanel");
    panel.classList.remove("trick-color-rot","trick-color-blau","trick-color-gruen","trick-color-gelb");
    const klass={Rot:"trick-color-rot",Blau:"trick-color-blau","Grün":"trick-color-gruen",Gelb:"trick-color-gelb"};
    if(data.trick.length&&data.status==="playing")panel.classList.add(klass[data.trick[0].card.color]);
    $("trickArea").innerHTML=data.trick.length?data.trick.map(e=>
        '<div class="played-card-wrap '+(data.status==="trickResult"&&e.player===data.lastWinner?'is-trick-winner':'')+'"><span>'+playerName(e.player)+'</span>'+card(e.card)+(data.status==="trickResult"&&e.player===data.lastWinner?'<span class="winner-badge">Stichgewinner</span>':'')+'</div>'
    ).join(""):"<p>Noch keine Karte gespielt.</p>";
    $("trickWinner").innerHTML=data.status==="trickResult"?playerName(data.lastWinner)+" gewinnt den Stich.":"";
}
function playCard(id){
    if(busy||data.status!=="playing"||data.currentPlayer!==HUMAN)return;
    const hand=data.hands[HUMAN],picked=hand.find(c=>c.id===id);
    if(!picked||!canPlayCard(hand,picked,data.trick[0]?.card.color))return;
    commitCard(HUMAN,picked);
}
function renderHand(){
    const area=$("handArea"),state={cardsPerPlayer:data.count,status:data.status,
        playerOrder:[HUMAN,BOT],singleCards:data.singleCards,currentPlayerId:data.currentPlayer};
    const scores={[HUMAN]:score(HUMAN),[BOT]:score(BOT)};
    if(renderBlindHand(area,state,{uid:HUMAN},scores,cardsToObject(data.hands[HUMAN]),playCard)){
        const button=area.closest("section").querySelector(".blind-own-slot button");
        if(button&&busy)button.disabled=true;
        $("handHint").textContent="Du siehst alle fremden Karten. Deine eigene bleibt bis zum Ausspielen verdeckt.";
        return;
    }
    area.closest("section").querySelector("h2").textContent="Deine Karten";
    $("handHint").textContent=data.status==="trickResult"?"Der Stich wird ausgewertet.":data.currentPlayer===HUMAN?"Du bist am Zug. Wähle eine Karte.":"Warte, bis du am Zug bist.";
    const cards=objectToCards(cardsToObject(data.hands[HUMAN]));
    area.innerHTML=cards.length?cards.map(c=>card(c,true,busy||data.status!=="playing"||data.currentPlayer!==HUMAN||!canPlayCard(cards,c,data.trick[0]?.card.color))).join(""):"<p>Du hast keine Karten mehr.</p>";
    area.querySelectorAll("[data-card-id]").forEach(b=>b.onclick=()=>playCard(b.dataset.cardId));
}
function renderGame(){
    $("roundNumber").textContent=data.round;
    $("currentPlayer").innerHTML=playerName(data.currentPlayer);
    renderOverview();renderTrick();renderHand();
}
function commitCard(player,picked){
    data.hands[player]=data.hands[player].filter(c=>c.id!==picked.id);
    data.trick.push({playerId:player,player,card:picked});
    if(data.trick.length<2){
        data.currentPlayer=player===HUMAN?BOT:HUMAN;save();renderGame();
        if(data.currentPlayer===BOT)runBot();
        return;
    }
    data.lastWinner=determineTrickWinner(data.trick,data.trick[0].card.color);
    data.wins[data.lastWinner]++;data.currentPlayer=data.lastWinner;data.status="trickResult";
    busy=true;save();renderGame();
    setTimeout(()=>{
        if(page!=="game.html")return;
        data.trick=[];data.trickNumber++;
        if(!data.hands[HUMAN].length&&!data.hands[BOT].length){finishRound();return;}
        data.status="playing";busy=false;save();renderGame();if(data.currentPlayer===BOT)runBot();
    },1800);
}
function runBot(){
    if(data.status!=="playing"||data.currentPlayer!==BOT||busy)return;
    busy=true;renderGame();
    setTimeout(()=>{
        if(data.status!=="playing"||data.currentPlayer!==BOT)return;
        const picked=chooseBotCard();
        busy=false;commitCard(BOT,picked);
    },850);
}
function finishRound(){
    for(const p of [HUMAN,BOT]){
        const value=calculateRoundPoints(data.tips[p],data.wins[p]);
        score(p).roundPoints=value;score(p).score+=value;
    }
    data.status="roundResult";save();
    $("resultTip").textContent=data.tips[HUMAN];
    $("resultTricks").textContent=data.wins[HUMAN];
    $("resultPoints").textContent=score(HUMAN).roundPoints;
    $("resultTotal").textContent=score(HUMAN).score;
    $("resultOverlay").hidden=false;
    let seconds=4;$("resultCountdown").textContent=seconds;
    const interval=setInterval(()=>{$("resultCountdown").textContent=--seconds;if(seconds<=0){clearInterval(interval);navigate("round");}},1000);
}
function renderRound(){
    const finished=data.finished;
    $("hostSetup").hidden=finished;
    $("playerWaiting").hidden=true;
    $("finalResultPanel").hidden=!finished;
    $("finalHostActions").hidden=!finished;
    $("finalPlayerWaiting").hidden=true;
    $("lastRoundPanel").hidden=!data.round||finished;
    if(finished){
        const ordered=[HUMAN,BOT].sort((a,b)=>score(b).score-score(a).score);
        $("finalResult").innerHTML='<div class="final-podium">'+[1,0].map(i=>ordered[i]?'<div class="podium-place place-'+(i+1)+'"><span class="podium-medal">'+(i?"🥈":"🏆")+'</span><strong class="podium-name">'+playerName(ordered[i])+'</strong><span class="podium-score">'+score(ordered[i]).score+' Punkte</span><div class="podium-block">'+(i+1)+'</div></div>':"").join("")+"</div>";
        return;
    }
    $("roundTitle").textContent="Runde "+(data.round+1)+" vorbereiten";
    // Nur die beiden Aktionen behalten; alle Eingaben und Hinweise ausblenden.
    for(const element of $("hostSetup").children)element.hidden=!element.classList.contains("round-actions");
    $("lastRoundScores").innerHTML='<table><tr><th>Spieler</th><th>Letzte Runde</th><th>Gesamt</th></tr>'+[HUMAN,BOT].map(p=>'<tr><td>'+playerName(p)+'</td><td>'+score(p).roundPoints+'</td><td>'+score(p).score+'</td></tr>').join("")+"</table>";
}
data=load();
if(page==="bot.html"){newGame();navigate("round");}
else if(!data||!data.scores||(!data.hands&&page!=="round.html")){newGame();navigate("round");}
else if(page==="tip.html"){
    if(data.status!=="tips"){navigate(data.status==="roundResult"?"round":"game");}
    else {if(data.starter===BOT&&data.tips[BOT]===null)botTip();renderTips();$("submitTipButton").onclick=submitTip;}
}
else if(page==="game.html"){
    if(!["playing","trickResult","roundResult"].includes(data.status)){navigate("tip");}
    else {renderGame();if(data.status==="playing"&&data.currentPlayer===BOT)runBot();else if(data.status==="roundResult")navigate("round");}
}
else if(page==="round.html"){
    renderRound();
    $("startRoundButton").onclick=startRound;
    $("finishGameButton").onclick=()=>{data.finished=true;save();renderRound();};
    $("newGameButton").onclick=()=>{newGame();startRound();};
    $("endRoomButton").onclick=()=>{sessionStorage.removeItem(KEY);location.replace("./index.html");};
}
