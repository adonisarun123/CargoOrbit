import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'FreyTara | Delivery to collection',description:'Secure proof of delivery, billing readiness and freight collections in one workspace.',robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
