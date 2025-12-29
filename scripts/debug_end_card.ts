
import * as fs from 'fs';
import * as path from 'path';

interface Branding {
    businessName: string;
    logoUrl?: string;
    address?: string;
    phone?: string;
    email?: string;
    hours?: string;
}

const branding: Branding = {
    businessName: "Sushi Yana",
    logoUrl: "https://www.sushi-yana.de/_shops/res/pics/logo.png",
    address: "Flughafenstraße 76, 12049 Berlin",
    email: "buero@sushi-yana.de",
    phone: "030 62737666",
    hours: "Mo-So: 11:30 - 22:30"
};

function generateBrandingHtml(branding: Branding) {
    const details: { icon: string, text: string }[] = [];
    if (branding.address) details.push({ icon: '📍', text: branding.address });
    if (branding.hours) {
        const hoursShort = branding.hours.length > 200 ? branding.hours.substring(0, 197) + '...' : branding.hours;
        details.push({ icon: '🕒', text: hoursShort });
    }
    if (branding.phone) details.push({ icon: '📞', text: branding.phone });
    if (branding.email && details.length < 4) details.push({ icon: '✉️', text: branding.email });

    if (details.length === 0) return null;

    const midPoint = Math.ceil(details.length / 2);
    const topDetails = details.slice(0, midPoint);
    const bottomDetails = details.slice(midPoint);

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;800;900&display=swap" rel="stylesheet">
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body, html { width: 1080px; height: 1920px; overflow: hidden; background: #000000; }
                
                .container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: space-between;
                    width: 100%;
                    height: 100%;
                    background: #000000;
                    padding: 100px 60px;
                }

                .top-details, .bottom-details {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 30px;
                    width: 100%;
                }

                .logo-section {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    padding: 40px 0;
                }

                .center-logo {
                    max-width: 800px;
                    max-height: 500px;
                    object-fit: contain;
                    filter: drop-shadow(0 0 40px rgba(255,255,255,0.15));
                }

                .business-name {
                    font-family: 'Montserrat', sans-serif;
                    font-size: 84px;
                    font-weight: 900;
                    color: #FACC15;
                    text-align: center;
                    text-transform: uppercase;
                    letter-spacing: 6px;
                    line-height: 1.1;
                    padding: 40px;
                    border: 4px solid #FACC15;
                    border-radius: 20px;
                    background: rgba(250, 204, 21, 0.05);
                }

                .row {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 24px;
                    color: #FFFFFF;
                    font-family: 'Montserrat', sans-serif;
                    background: #111111;
                    border: 2px solid #333333;
                    padding: 20px 40px;
                    border-radius: 60px;
                    width: fit-content;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                }

                .icon { font-size: 44px; }
                .text {
                    font-size: 34px;
                    font-weight: 700;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="content-wrapper">
                    <div class="top-details">
                        ${topDetails.map(d => `
                            <div class="row">
                                <span class="icon">${d.icon}</span>
                                <span class="text">${d.text}</span>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="logo-section">
                        ${branding.logoUrl && !branding.logoUrl.toLowerCase().endsWith('.ico')
            ? `<img src="${branding.logoUrl}" class="center-logo" />`
            : `<h1 class="business-name">${branding.businessName}</h1>`
        }
                    </div>

                    <div class="bottom-details">
                        ${bottomDetails.map(d => `
                            <div class="row">
                                <span class="icon">${d.icon}</span>
                                <span class="text">${d.text}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
    return html;
}

const html = generateBrandingHtml(branding);
if (html) {
    fs.writeFileSync('end_card_debug.html', html);
    console.log('Generated end_card_debug.html');
}
