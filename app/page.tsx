import { getChatGPTUser,chatGPTSignInPath } from './chatgpt-auth';
import {importCourseCatalog} from '../lib/course-catalog';
export const dynamic='force-dynamic';
export default async function Home(){
 const user=await getChatGPTUser();if(user)await importCourseCatalog(user);
 return <main className="welcome-page"><header className="welcome-header"><a className="welcome-brand" href="/">拾知<span>SHIZHI</span></a><span>属于你的学习空间</span></header><div className="welcome-layout"><section className="welcome-art"><img src="/images/study-welcome.png" alt="窗边学习书桌、书本和暖色阳光"/><div className="welcome-art-caption"><span>A LITTLE WISER, EVERY DAY</span><p>每一份认真，<br/>都值得好好留下。</p></div></section><section className="welcome-card"><img className="welcome-avatar" src="/favicon.svg" alt="拾知标志"/><span className="welcome-eyebrow">欢迎来到拾知</span><h1>今天，<br/>也学懂一点。</h1><p>从一个问题开始，<br/>把零散的理解，慢慢变成自己的知识。</p><a className="welcome-enter" href={user?'/space.html':chatGPTSignInPath('/space.html')} target="_top">{user?'进入我的学习空间':'登录并进入学习空间'}<span aria-hidden="true">→</span></a><div className="welcome-foot">课程 · 上课提问 · 复习总结 · 纸质笔记</div></section></div><footer className="welcome-bottom">按自己的节奏，慢慢学懂。</footer></main>;
}
