import moment from 'moment';
import QRCode from 'qrcode';
import IDCard from '../models/IDCard';

export const getCardPrefix = (ownerType: string) => ownerType === 'student' ? 'STU' : ownerType === 'teacher' ? 'TCH' : 'STF';

export const generateCardNumber = async (ownerType: 'student' | 'teacher' | 'staff', institutionId: any) => {
  const year = new Date().getFullYear();
  const prefix = getCardPrefix(ownerType);
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const count = await IDCard.countDocuments({ ownerType, institutionId, issuedAt: { $gte: start, $lt: end } });
  return `${prefix}-${year}-${String(count + 1).padStart(6, '0')}`;
};

export const buildCardPayload = async (ownerType: 'student' | 'teacher' | 'staff', ownerId: any, institutionId: any, issuedBy: any, photoUrl = '') => {
  const cardNumber = await generateCardNumber(ownerType, institutionId);
  const qrCodeData = `drms://id-card/${cardNumber}`;
  return {
    ownerType,
    ownerId,
    institutionId,
    issuedBy,
    cardNumber,
    cardType: ownerType,
    photoUrl,
    qrCodeData,
    qrCodeImage: await QRCode.toDataURL(qrCodeData),
    barcodeData: cardNumber,
    validityStart: new Date(),
    validityEnd: moment().add(1, 'year').toDate(),
    issuedAt: new Date(),
    status: 'active',
  };
};
