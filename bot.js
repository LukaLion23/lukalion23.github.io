// Eigenständiger lokaler Bappo-Modus ohne Firebase-Zugriff.
const COLORS = ["Rot","Blau","Grün","Gelb"];
const byId = id => document.getElementById(id);
const names = ["Du","Computer"];
const image = {Rot:"rot",Blau:"blau",Grün:"gruen",Gelb:"gelb"};
const css = {Rot:"rot",Blau:"blau",Grün:"gruen",Gelb:"gelb"};
let round = 0, starter = 0, count = 0, turn = 0, phase = "tip";
let hands = [[],[]], tips = [null,null], wins = [0,0], scores = [0,0], trick = [];
let locked = false, gameId = 0;
function random(max) {
    const values = new Uint32Array(1), limit = 0x100000000 - (0x100000000 % max);
    do { crypto.getRandomValues(values); } while (values[0] >= limit);
    return values[0] % max;
}
function deck() {
    const cards = COLORS.flatMap(color => Array.from({length:20},(_,i)=>({id:color+"_"+(i+1),color,value:i+1})));
    for(let i=cards.length-1;i>0;i--){const j=random(i+1);[cards[i],cards[j]]=[cards[j],cards[i]];}
    return cards;
}
function cardHtml(card,disabled=false) {
    return '<button type="button" class="card card-'+css[card.color]+'" data-card="'+card.id+'" aria-label="'+card.color+' '+card.value+'" '+(disabled?'disabled':'')+'><img class="card-color-image" src="./assets/cards/'+image[card.color]+'.png?v=80" alt=""><strong>'+card.value+'</strong></button>';
}
function legal(hand,lead) {return !lead || !hand.some(c=>c.color===lead) ? hand : hand.filter(c=>c.color===lead);}
function strength(card,lead){return (card.color==="Rot"?2000:card.color===lead?1000:0)+card.value;}
function winnerOf(entries){const lead=entries[0].card.color;return entries.reduce((best,e)=>strength(e.card,lead)>strength(best.card,lead)?e:best).player;}
function points(tip,actual){return tip===actual?10+5*actual:-5*Math.abs(tip-actual);}
function render() {
    byId("humanScore").textContent=scores[0]+" Punkte";
    byId("computerScore").textContent=scores[1]+" Punkte";
    byId("humanInfo").textContent="Tipp "+(tips[0]??"–")+" · Stiche "+wins[0];
    byId("computerInfo").textContent="Tipp "+(tips[1]??"–")+" · Stiche "+wins[1];
    byId("roundInfo").textContent="Runde "+round+" · "+count+" Karte"+(count===1?"":"n")+" pro Spieler";
    byId("tipPanel").hidden=phase!=="tip";
    byId("playPanel").hidden=phase!=="play";
    byId("resultPanel").hidden=phase!=="result";
    if(phase==="tip") renderTips();
    if(phase==="play") renderPlay();
}
function renderTips() {
    const total=tips.reduce((s,t)=>s+(t??0),0);
    const last=turn!==starter;
    byId("tipNote").textContent=(count===1?"Ein-Karten-Runde: Die eigene Karte bleibt verdeckt. ":"")+(last?"Computer-Tipp: "+tips[1]+". Zusammen dürfen die Tipps nicht "+count+" ergeben.":"Du beginnst mit deinem Tipp.");
    byId("status").textContent="Du bist mit dem Tippen dran.";
    byId("tipOptions").innerHTML=Array.from({length:count+1},(_,i)=>'<button type="button" data-tip="'+i+'" '+(last && total+i===count?'disabled':'')+'>'+i+'</button>').join("");
    byId("tipOptions").querySelectorAll("[data-tip]").forEach(btn=>btn.onclick=()=>chooseTip(Number(btn.dataset.tip)));
}
function estimate(hand,visibleOpponent=[]) {
    const cards=hand.length?hand:visibleOpponent;
    const high=cards.filter(c=>c.color==="Rot"&&c.value>=12 || c.value>=17).length;
    const expected=hand.length?high*0.7+Math.max(0,hand.length-high)*0.23:Math.max(0,count-visibleOpponent.filter(c=>c.color==="Rot").length)*0.27;
    return Math.max(0,Math.min(count,Math.round(expected+(random(3)-1)*0.4)));
}
function chooseBotTip(last) {
    let value=estimate(hands[1],count===1?hands[0]:[]);
    if(last && value+tips[0]===count) value=value<count?value+1:value-1;
    tips[1]=value;
}
function chooseTip(value) {
    if(phase!=="tip" || turn!==0 || (starter===1 && value+tips[1]===count))return;
    tips[0]=value;
    if(starter===0)chooseBotTip(true);
    phase="play";turn=starter;
    byId("status").textContent="Die Tipps stehen fest.";
    render();void botTurn();
}
function startRound() {
    gameId++;locked=false;round++;count=1+random(10);starter=(round-1)%2;turn=starter;
    const pile=deck();hands=[pile.slice(0,count),pile.slice(count,count*2)];
    tips=[null,null];wins=[0,0];trick=[];phase="tip";
    if(starter===1){chooseBotTip(false);turn=0;}
    render();
}
function renderPlay() {
    const lead=trick[0]?.card.color;
    const one=count===1;
    byId("handTitle").textContent=one?"Deine Karte (verdeckt)":"Deine Karten";
    byId("status").textContent=turn===0?"Du bist am Zug.": "Computer ist am Zug.";
    byId("trick").innerHTML=trick.map(e=>'<div><strong>'+names[e.player]+'</strong><div>'+cardHtml(e.card,true)+'</div></div>').join("")||"<p>Noch keine Karte gespielt.</p>";
    if(one && hands[1].length && !trick.some(e=>e.player===1)){
        byId("trick").innerHTML+='<div><strong>Computerkarte</strong><div>'+cardHtml(hands[1][0],true)+'</div></div>';
    }
    if(one && hands[0].length) {
        byId("botHand").innerHTML='<button class="card blind-card" type="button" '+(turn!==0||locked?'disabled':'')+' id="blindPlay">Eigene Karte spielen</button>';
        byId("blindPlay").onclick=()=>playCard(0,hands[0][0].id);
        return;
    }
    const valid=legal(hands[0],lead).map(c=>c.id);
    byId("botHand").innerHTML=hands[0].map(c=>cardHtml(c,turn!==0||locked||!valid.includes(c.id))).join("");
    byId("botHand").querySelectorAll("[data-card]").forEach(btn=>btn.onclick=()=>playCard(0,btn.dataset.card));
}
function selectBotCard() {
    const options=legal(hands[1],trick[0]?.card.color);
    if(trick.length) {
        const target=trick[0].card,winning=options.filter(c=>strength(c,target.color)>strength(target,target.color));
        const wantsWin=wins[1]<tips[1];
        const group=wantsWin&&winning.length?winning:options;
        return [...group].sort((a,b)=>strength(a,target.color)-strength(b,target.color))[wantsWin?0:0];
    }
    return [...options].sort((a,b)=>strength(b,a.color)-strength(a,a.color))[0];
}
async function botTurn() {
    if(phase!=="play"||turn!==1||locked)return;
    const id=gameId;locked=true;
    await new Promise(resolve=>setTimeout(resolve,650));
    if(id!==gameId||phase!=="play")return;
    locked=false;playCard(1,selectBotCard().id);
}
function playCard(player,id) {
    if(phase!=="play"||turn!==player||locked)return;
    const hand=hands[player],card=hand.find(c=>c.id===id);
    if(!card||!legal(hand,trick[0]?.card.color).some(c=>c.id===id))return;
    hands[player]=hand.filter(c=>c.id!==id);trick.push({player,card});
    if(trick.length<2){turn=1-player;render();void botTurn();return;}
    const victor=winnerOf(trick);wins[victor]++;locked=true;render();
    const version=gameId;
    byId("status").textContent=names[victor]+" gewinnt den Stich.";
    setTimeout(()=>{
        if(version!==gameId)return;
        trick=[];locked=false;
        if(!hands[0].length&&!hands[1].length){finishRound();return;}
        turn=victor;render();void botTurn();
    },1100);
}
function finishRound() {
    phase="result";
    const deltas=tips.map((t,i)=>points(t,wins[i]));scores=scores.map((v,i)=>v+deltas[i]);
    byId("roundResult").innerHTML=names.map((n,i)=>'<p><strong>'+n+':</strong> Tipp '+tips[i]+', '+wins[i]+' Stiche → '+(deltas[i]>=0?"+":"")+deltas[i]+' Punkte · Gesamt '+scores[i]+'</p>').join("");
    byId("status").textContent="Runde abgeschlossen.";render();
}
byId("nextRound").onclick=startRound;
byId("newGame").onclick=()=>{scores=[0,0];round=0;startRound();};
startRound();
