// import { formatDate } from './index'; // Appointment letter template generator

interface AppointmentLetterData {
  teacherName: string;
  position: string;
  designation: string;
  joiningDate: string;
  departmentName: string;
  salary: number;
  qualification: string;
  schoolName: string;
  schoolAddress: string;
  principalName: string;
  letterDate: string;
}

export const generateAppointmentLetter = (data: AppointmentLetterData): string => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body {
                font-family: 'Arial', sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f9f9f9;
            }
            .letter-container {
                background-color: white;
                padding: 40px;
                border: 2px solid #2c3e50;
                border-radius: 5px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
                border-bottom: 3px solid #3498db;
                padding-bottom: 20px;
            }
            .header h1 {
                margin: 0;
                color: #2c3e50;
                font-size: 28px;
            }
            .header p {
                margin: 5px 0;
                color: #7f8c8d;
                font-size: 14px;
            }
            .letter-date {
                text-align: right;
                margin-bottom: 20px;
                color: #555;
                font-style: italic;
            }
            .recipient {
                margin-bottom: 30px;
            }
            .recipient p {
                margin: 5px 0;
            }
            .salutation {
                font-weight: bold;
                margin-bottom: 15px;
            }
            .body-text {
                text-align: justify;
                margin-bottom: 15px;
                line-height: 1.8;
            }
            .appointment-details {
                background-color: #ecf0f1;
                padding: 15px;
                margin: 20px 0;
                border-left: 4px solid #3498db;
                border-radius: 3px;
            }
            .appointment-details p {
                margin: 8px 0;
                display: flex;
                justify-content: space-between;
            }
            .appointment-details strong {
                color: #2c3e50;
            }
            .responsibilities {
                margin: 20px 0;
            }
            .responsibilities h3 {
                color: #2c3e50;
                text-decoration: underline;
                margin-bottom: 10px;
            }
            .responsibilities ol {
                margin: 10px 0;
                padding-left: 20px;
            }
            .responsibilities li {
                margin: 8px 0;
                text-align: justify;
            }
            .terms {
                margin: 20px 0;
                font-size: 13px;
            }
            .terms h3 {
                color: #2c3e50;
                text-decoration: underline;
                margin-bottom: 10px;
            }
            .terms p {
                margin: 8px 0;
                text-align: justify;
            }
            .closing {
                margin-top: 40px;
            }
            .closing-text {
                margin-bottom: 30px;
                font-style: italic;
            }
            .signature-section {
                display: flex;
                justify-content: space-between;
                margin-top: 50px;
            }
            .signature-block {
                text-align: center;
                width: 45%;
            }
            .signature-block .line {
                border-top: 2px solid #333;
                width: 100%;
                margin-top: 50px;
            }
            .signature-block p {
                margin: 5px 0;
                font-weight: bold;
                color: #2c3e50;
            }
            .footer {
                text-align: center;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #bdc3c7;
                font-size: 12px;
                color: #7f8c8d;
            }
        </style>
    </head>
    <body>
        <div class="letter-container">
            <!-- Header -->
            <div class="header">
                <h1>${data.schoolName}</h1>
                <p>${data.schoolAddress}</p>
            </div>

            <!-- Date -->
            <div class="letter-date">
                Date: ${data.letterDate}
            </div>

            <!-- Recipient Info -->
            <div class="recipient">
                <p><strong>${data.teacherName}</strong></p>
                <p>Position: ${data.position}</p>
            </div>

            <!-- Salutation -->
            <p class="salutation">Dear ${data.teacherName},</p>

            <!-- Body -->
            <p class="body-text">
                We are pleased to offer you the position of <strong>${data.designation}</strong> at <strong>${data.schoolName}</strong>. 
                We believe your qualifications and experience will be a valuable addition to our educational institution.
            </p>

            <!-- Appointment Details -->
            <div class="appointment-details">
                <p><strong>Position:</strong> <span>${data.designation}</span></p>
                <p><strong>Department:</strong> <span>${data.departmentName}</span></p>
                <p><strong>Joining Date:</strong> <span>${data.joiningDate}</span></p>
                <p><strong>Monthly Salary:</strong> <span>৳ ${data.salary.toLocaleString('en-US')}</span></p>
                <p><strong>Qualification:</strong> <span>${data.qualification}</span></p>
            </div>

            <p class="body-text">
                This appointment is offered on a probationary period of 3 (three) months, during which your performance will be assessed. 
                Upon successful completion of the probationary period, your appointment will be confirmed.
            </p>

            <!-- Responsibilities -->
            <div class="responsibilities">
                <h3>Key Responsibilities</h3>
                <ol>
                    <li>To teach the assigned subjects with dedication and expertise</li>
                    <li>To maintain discipline and ensure quality education</li>
                    <li>To participate in co-curricular activities and school events</li>
                    <li>To prepare lesson plans and evaluation assessments</li>
                    <li>To maintain professional conduct and uphold the school's values</li>
                    <li>To communicate effectively with parents regarding student progress</li>
                </ol>
            </div>

            <!-- Terms and Conditions -->
            <div class="terms">
                <h3>Terms and Conditions</h3>
                <p>
                    1. <strong>Working Hours:</strong> Regular working hours as per school schedule. Additional hours may be required for school functions and meetings.
                </p>
                <p>
                    2. <strong>Conduct:</strong> You are expected to maintain high professional and moral standards at all times.
                </p>
                <p>
                    3. <strong>Leave:</strong> Leave will be granted as per school policy and government regulations.
                </p>
                <p>
                    4. <strong>Confidentiality:</strong> All information regarding school matters and students must be kept confidential.
                </p>
                <p>
                    5. <strong>Probation:</strong> This appointment is subject to successful completion of a 3-month probationary period.
                </p>
            </div>

            <p class="body-text">
                Please confirm your acceptance of this appointment by signing and returning the attached acknowledgment copy. 
                Should you have any questions regarding this appointment, please do not hesitate to contact us.
            </p>

            <!-- Closing -->
            <div class="closing">
                <p class="closing-text">
                    We look forward to working with you and wish you a successful career at ${data.schoolName}.
                </p>
            </div>

            <!-- Signature Section -->
            <div class="signature-section">
                <div class="signature-block">
                    <p>Employee Acknowledgment</p>
                    <p style="font-size: 12px; color: #7f8c8d;">Signature & Date</p>
                    <div class="line"></div>
                </div>
                <div class="signature-block">
                    <p>${data.principalName}</p>
                    <p style="font-size: 12px; color: #7f8c8d;">Principal/Head of Institution</p>
                    <div class="line"></div>
                </div>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p>This is an electronically generated document. Printed and digitally signed copies are valid.</p>
                <p>© ${new Date().getFullYear()} ${data.schoolName}. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
  `;
};
