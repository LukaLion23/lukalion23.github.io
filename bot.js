import {createDeck,shuffle,cardsToObject,objectToCards,canPlayCard,determineTrickWinner,calculateRoundPoints,getCardColorClass,getCardImagePath,escapeHtml,renderPlayerNameHtml,renderBlindHand,getSavedPlayerName} from "./firebase-common.js?v=87";

const KEY="bappoSoloV3", TIME_KEY="bappoSoloDailyTimeV1", LIMIT=1800000, HUMAN="human";
const $=id=>document.getElementById(id), page=location.pathname.split("/").pop();
const url=p=>"./"+p+".html?solo=1&v=89";
let data, busy=false, expired=false, lastTick=Date.now(), actionTimer=null;
function name(){return (getSavedPlayerName()||"Du").slice(0,30);}
function maxBots(){return name()==="LukasLion"?10:4;}
function day(){const d=new Date();return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate();}
function record(){try{const r=JSON.parse(localStorage.getItem(TIME_KEY));return r?.day===day()?r:{day:day(),elapsed:0};}catch{return {day:day(),elapsed:0};}}
function showLimit(){
    if(expired)return;
    expired=true;busy=true;
    if(actionTimer)clearTimeout(actionTimer);
    const el=document.createElement("div");
    el.style.cssText="position:fixed;inset:0;z-index:100000;background:#082b26;color:#f5f3e9;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:25px;text-align:center;font-family:inherit";
    el.innerHTML='<h2 style="font-size:clamp(23px,6vw,38px);line-height:1.3">Dein Zeitlimit für das Spiel gegen einen Computer ist aufgebraucht. Mach was Sinnvolles.</h2><a href="./index.html" style="padding:12px 20px;border-radius:10px;background:#d7ae59;color:#14251b;font-weight:800;text-decoration:none">Zurück zur Startseite</a>';
    document.body.append(el);
}
function timeCheck(){
    const now=Date.now(),r=record(),delta=Math.max(0,Math.min(now-lastTick,5000));
    lastTick=now;
    if(!document.hidden&&!expired&&r.elapsed<LIMIT){r.elapsed=Math.min(LIMIT,r.elapsed+delta);localStorage.setItem(TIME_KEY,JSON.stringify(r));}
    if(r.elapsed>=LIMIT)showLimit();
    return !expired;
}
window.addEventListener("visibilitychange",()=>{lastTick=Date.now();timeCheck();});
window.addEventListener("storage",e=>{if(e.key===TIME_KEY)timeCheck();});
timeCheck();setInterval(timeCheck,1000);
function save(){sessionStorage.setItem(KEY,JSON.stringify(data));}
function load(){try{return JSON.parse(sessionStorage.getItem(KEY));}catch{return null;}}
function go(p){if(timeCheck())location.replace(url(p));}
function players(){return data.players;}
function bots(){return players().filter(p=>p!==HUMAN);}
function score(p){return data.scores[p];}
function playerName(p){return renderPlayerNameHtml(score(p).name);}
function startNew(botCount){
    const capped=Math.min(maxBots(),Math.max(1,Number(botCount)||1));
    const ids=[HUMAN,...Array.from({length:capped},(_,i)=>"bot"+(i+1))];
    data={players:ids,round:0,finished:false,status:"roundSetup",scores:{}};
    ids.forEach((id,i)=>data.scores[id]={name:i===0?name():"Computer "+i,score:0,roundPoints:0});
    save();
}
function selectBots(){
    $("botPlayerName").innerHTML="Du spielst als "+renderPlayerNameHtml(name())+".";
    $("botLimitInfo").textContent="Du kannst gegen bis zu "+maxBots()+" Computergegner spielen.";
    $("botCount").innerHTML=Array.from({length:maxBots()},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+' Bot'+(i===0?"":"s")+'</option>').join("");
    $("botStart").onclick=()=>{if(!timeCheck())return;startNew($("botCount").value);go("round");};
}
function card(c,button=false,disabled=false){
    const tag=button?"button":"div";
    return '<'+tag+' class="card '+(button?"":"display-card ")+getCardColorClass(c.color)+'" '+(button?'type="button" data-card-id="'+escapeHtml(c.id)+'" '+(disabled?"disabled":""):'role="img"')+' aria-label="'+escapeHtml(c.color)+" "+c.value+'"><img class="card-color-image" src="'+getCardImagePath(c.color)+'" alt="" aria-hidden="true" draggable="false"><strong>'+c.value+"</strong></"+tag+">";
}
function rotate(array,id){const i=array.indexOf(id);return [...array.slice(i),...array.slice(0,i)];}
function startRound(){
    if(!timeCheck())return;
    const pile=createDeck();shuffle(pile);
    const count=Math.floor(Math.random()*(Math.min(20,Math.floor(80/players().length))+1));
    data.round++;data.count=count;data.starter=players()[(data.round-1)%players().length];
    data.order=rotate(players(),data.starter);data.currentTip=data.starter;data.currentPlayer=data.starter;
    data.hands={};data.tips={};data.wins={};data.trick=[];data.trickNumber=1;data.lastWinner=null;
    for(const p of players()){data.hands[p]=[];data.tips[p]=null;data.wins[p]=0;}
    for(let i=0;i<count;i++)for(const p of players())data.hands[p].push(pile.pop());
    data.singleCards=count===1?Object.fromEntries(players().map(p=>[p,data.hands[p][0]])):null;
    data.status=count===0?"roundResult":"tips";
    if(count===0){
        for(const p of players()){data.tips[p]=0;score(p).roundPoints=calculateRoundPoints(0,0);score(p).score+=score(p).roundPoints;}
        save();go("round");return;
    }
    save();go("tip");
}
function forbiddenTip(){if(data.currentTip!==data.order[data.order.length-1])return null;return data.count-data.order.slice(0,-1).reduce((sum,p)=>sum+(data.tips[p]||0),0);}
function estimate(p){
    const hand=data.hands[p],playerCount=players().length;
    const weight=c=>{
        const high=Math.pow(c.value/20,3);
        return c.color==="Rot"?1.1+2.5*high:0.45+1.65*high;
    };
    const average=(20*(1.1+3*0.45)+(2.5+3*1.65)*Array.from({length:20},(_,i)=>Math.pow((i+1)/20,3)).reduce((a,b)=>a+b,0))/80;
    const expected=hand.reduce((sum,c)=>sum+weight(c),0)/(playerCount*average);
    let tip=Math.floor(expected);
    if(Math.random()<expected-tip)tip++;
    if(hand.some(c=>c.color==="Rot"&&c.value===20))tip=Math.max(1,tip);
    return Math.max(0,Math.min(hand.length,tip));
}
function advanceTips(){
    if(data.status!=="tips")return;
    while(data.currentTip!==HUMAN){
        const p=data.currentTip;let tip=estimate(p),forbidden=forbiddenTip();
        if(tip===forbidden)tip=tip<data.count?tip+1:tip-1;
        data.tips[p]=tip;
        const index=data.order.indexOf(p);
        if(index===data.order.length-1){data.status="playing";data.currentPlayer=data.starter;break;}
        data.currentTip=data.order[index+1];
    }
    save();
}
function submitTip(){
    if(busy||data.status!=="tips"||data.currentTip!==HUMAN)return;
    const value=Number($("tipInput").value),forbidden=forbiddenTip();
    if(!Number.isInteger(value)||value<0||value>data.count){alert("Bitte gib eine ganze Zahl von 0 bis "+data.count+" ein.");return;}
    if(value===forbidden){alert("Die Summe der Tipps darf nicht genau der Kartenanzahl entsprechen.");return;}
    data.tips[HUMAN]=value;
    const i=data.order.indexOf(HUMAN);
    if(i===data.order.length-1){data.status="playing";data.currentPlayer=data.starter;}
    else{data.currentTip=data.order[i+1];advanceTips();}
    save();go("game");
}
function renderTips(){
    $("roundTitle").textContent="Runde "+data.round+": Tipp abgeben";
    $("playerDisplay").innerHTML="Du spielst als "+playerName(HUMAN)+".";
    $("currentTipPlayer").innerHTML="Jetzt tippt: <strong>"+playerName(HUMAN)+"</strong>";
    $("tipInput").max=String(data.count);
    const forbidden=forbiddenTip();
    $("tipStatus").textContent=forbidden!==null&&forbidden>=0&&forbidden<=data.count?
        "Du bist als Letzter dran. Du darfst nicht "+forbidden+" tippen, weil die Summe aller Tipps sonst genau "+data.count+" wäre.":
        "Du bist dran. Erlaubt sind 0 bis "+data.count+" Stiche.";
    $("tipOverview").innerHTML='<div class="tip-order-list">'+data.order.map((p,i)=>{
        const result=data.tips[p]!==null?data.tips[p]+" Stiche":p===data.currentTip?"tippt jetzt":"wartet";
        return '<div class="tip-order-row '+(p===data.currentTip?"is-current":"")+'"><span class="tip-position">'+(i+1)+'</span><span class="tip-player-name">'+playerName(p)+(p===data.starter?'<small>Rundenanfänger</small>':"")+'</span><strong class="tip-value">'+escapeHtml(result)+'</strong></div>';
    }).join("")+"</div>";
    const area=$("handArea"),state={cardsPerPlayer:data.count,playerOrder:players(),singleCards:data.singleCards,status:"tips"};
    if(!renderBlindHand(area,state,{uid:HUMAN},data.scores,cardsToObject(data.hands[HUMAN]),null)){
        area.closest("section").querySelector("h2").textContent="Deine Karten";
        area.innerHTML=objectToCards(cardsToObject(data.hands[HUMAN])).map(c=>card(c)).join("");
    }
}
function strength(c,lead){return (c.color==="Rot"?2000:c.color===lead?1000:0)+c.value;}
function chooseBotCard(p){
    const hand=data.hands[p],lead=data.trick[0]?.card.color;
    const valid=hand.filter(c=>canPlayCard(hand,c,lead));
    const wantsWin=data.wins[p]<data.tips[p];
    const needed=Math.max(0,data.tips[p]-data.wins[p]);
    const remaining=hand.length;
    const priority=c=>c.color==="Rot"?100+c.value:c.value;
    const weak=[...valid].sort((a,b)=>priority(a)-priority(b));
    if(!lead){
        const nonTrump=valid.filter(c=>c.color!=="Rot");
        if(!wantsWin)return (nonTrump.length?nonTrump:valid).reduce((a,b)=>a.value<b.value?a:b);
        const highNonTrump=nonTrump.filter(c=>c.value>=14).sort((a,b)=>b.value-a.value);
        if(highNonTrump.length&&(remaining>needed||!valid.some(c=>c.color==="Rot"&&c.value>=16)))
            return highNonTrump[0];
        const trumps=valid.filter(c=>c.color==="Rot").sort((a,b)=>b.value-a.value);
        if(trumps.length&&(remaining<=needed||!nonTrump.length))return trumps[0];
        return [...nonTrump].sort((a,b)=>b.value-a.value)[0]||weak[0];
    }
    const current=determineTrickWinner(data.trick,lead);
    const target=data.trick.find(e=>e.playerId===current).card;
    const winners=valid.filter(c=>strength(c,lead)>strength(target,lead))
        .sort((a,b)=>priority(a)-priority(b));
    if(wantsWin&&winners.length){
        const nonTrump=winners.filter(c=>c.color!=="Rot");
        if(nonTrump.length)return nonTrump[0];
        if(remaining<=needed||data.trick.length===players().length-1||target.color==="Rot")return winners[0];
        if(winners[0].value>=16)return winners[0];
    }
    const losing=valid.filter(c=>strength(c,lead)<=strength(target,lead));
    if(losing.length)return [...losing].sort((a,b)=>priority(a)-priority(b))[0];
    return wantsWin?winners[0]:weak[0];
}
function renderOverview(){
    $("playerOverview").innerHTML='<div class="player-overview-grid">'+players().map(p=>'<article class="player-stat '+(data.currentPlayer===p&&data.status==="playing"?"is-current":"")+'"><h3>'+playerName(p)+'</h3><div><span>Tipp</span><strong>'+data.tips[p]+'</strong></div><div><span>Stiche</span><strong>'+data.wins[p]+'</strong></div></article>').join("")+"</div>";
}
function renderTrick(){
    const panel=$("trickPanel"),klass={Rot:"trick-color-rot",Blau:"trick-color-blau","Grün":"trick-color-gruen",Gelb:"trick-color-gelb"};
    panel.classList.remove(...Object.values(klass));
    if(data.trick.length&&data.status==="playing")panel.classList.add(klass[data.trick[0].card.color]);
    $("trickArea").innerHTML=data.trick.length?data.trick.map(e=>'<div class="played-card-wrap '+(data.status==="trickResult"&&e.playerId===data.lastWinner?"is-trick-winner":"")+'"><span>'+playerName(e.playerId)+'</span>'+card(e.card)+(data.status==="trickResult"&&e.playerId===data.lastWinner?'<span class="winner-badge">Stichgewinner</span>':"")+"</div>").join(""):"<p>Noch keine Karte gespielt.</p>";
    $("trickWinner").innerHTML=data.status==="trickResult"?playerName(data.lastWinner)+" gewinnt den Stich.":"";
}
function playCard(id){
    if(expired||busy||data.status!=="playing"||data.currentPlayer!==HUMAN)return;
    const hand=data.hands[HUMAN],picked=hand.find(c=>c.id===id);
    if(!picked||!canPlayCard(hand,picked,data.trick[0]?.card.color))return;
    commitCard(HUMAN,picked);
}
function renderHand(){
    const area=$("handArea"),state={cardsPerPlayer:data.count,status:data.status,playerOrder:players(),singleCards:data.singleCards,currentPlayerId:data.currentPlayer};
    if(renderBlindHand(area,state,{uid:HUMAN},data.scores,cardsToObject(data.hands[HUMAN]),playCard)){
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
function afterTrick(){
    if(expired)return;
    data.trick=[];data.trickNumber++;
    if(players().every(p=>data.hands[p].length===0)){finishRound();return;}
    data.status="playing";data.currentPlayer=data.lastWinner;busy=false;save();renderGame();scheduleBot();
}
function commitCard(p,c){
    data.hands[p]=data.hands[p].filter(a=>a.id!==c.id);
    data.trick.push({playerId:p,card:c});
    if(data.trick.length<players().length){
        data.currentPlayer=players()[(players().indexOf(p)+1)%players().length];
        save();renderGame();scheduleBot();return;
    }
    data.lastWinner=determineTrickWinner(data.trick,data.trick[0].card.color);
    data.wins[data.lastWinner]++;data.currentPlayer=data.lastWinner;data.status="trickResult";
    busy=true;save();renderGame();
    actionTimer=setTimeout(afterTrick,1800);
}
function scheduleBot(){
    if(expired||busy||data.status!=="playing"||data.currentPlayer===HUMAN)return;
    busy=true;renderGame();
    actionTimer=setTimeout(()=>{
        if(expired||data.status!=="playing"||data.currentPlayer===HUMAN)return;
        const id=data.currentPlayer,c=chooseBotCard(id);
        busy=false;commitCard(id,c);
    },650);
}
function finishRound(){
    for(const p of players()){
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
    const interval=setInterval(()=>{
        if(expired){clearInterval(interval);return;}
        $("resultCountdown").textContent=--seconds;
        if(seconds<=0){clearInterval(interval);go("round");}
    },1000);
}
function renderRound(){
    const finished=data.finished;
    $("hostSetup").hidden=finished;$("playerWaiting").hidden=true;
    $("finalResultPanel").hidden=!finished;$("finalHostActions").hidden=!finished;
    $("finalPlayerWaiting").hidden=true;$("lastRoundPanel").hidden=!data.round||finished;
    if(finished){
        const ordered=[...players()].sort((a,b)=>score(b).score-score(a).score);
        $("finalResult").innerHTML='<div class="final-podium">'+[1,0,2].map(i=>ordered[i]?'<div class="podium-place place-'+(i+1)+'"><span class="podium-medal">'+["🏆","🥈","🥉"][i]+'</span><strong class="podium-name">'+playerName(ordered[i])+'</strong><span class="podium-score">'+score(ordered[i]).score+' Punkte</span><div class="podium-block">'+(i+1)+"</div></div>":"").join("")+"</div>";
        return;
    }
    for(const e of $("hostSetup").children)e.hidden=!e.classList.contains("round-actions");
    $("lastRoundScores").innerHTML='<table><tr><th>Spieler</th><th>Letzte Runde</th><th>Gesamt</th></tr>'+players().map(p=>'<tr><td>'+playerName(p)+'</td><td>'+score(p).roundPoints+'</td><td>'+score(p).score+'</td></tr>').join("")+"</table>";
}
data=load();
if(page==="bot.html"){
    sessionStorage.removeItem(KEY);
    selectBots();
}
else if(!data||!Array.isArray(data.players)||data.players.length<2||bots().length>maxBots())go("bot");
else{
    if(data.scores[HUMAN]){data.scores[HUMAN].name=name();save();}
    if(page==="round.html"){
        renderRound();
        $("startRoundButton").onclick=startRound;
        $("finishGameButton").onclick=()=>{data.finished=true;save();renderRound();};
        $("newGameButton").onclick=()=>{startNew(bots().length);go("round");};
        $("endRoomButton").onclick=()=>{sessionStorage.removeItem(KEY);location.replace("./index.html");};
    }else if(page==="tip.html"){
        if(data.status!=="tips")go(data.status==="roundResult"?"round":"game");
        else{advanceTips();renderTips();$("submitTipButton").onclick=submitTip;}
    }else if(page==="game.html"){
        if(!["playing","trickResult","roundResult"].includes(data.status))go("tip");
        else if(data.status==="roundResult")go("round");
        else{renderGame();if(data.status==="trickResult"){busy=true;actionTimer=setTimeout(afterTrick,1800);}else scheduleBot();}
    }
}