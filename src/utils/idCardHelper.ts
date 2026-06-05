import mongoose from 'mongoose';

export async function autoGenerateIdCard(
  doc: any,
  ownerType: 'student' | 'teacher' | 'staff' | 'head'
) {
  try {
    const IDCard = mongoose.model('IDCard');
    const existing = await IDCard.findOne({
      ownerId: doc.userId,
      institutionId: doc.institutionId,
    });
    if (!existing) {
      const prefix = ownerType === 'student' ? 'STU' : ownerType === 'teacher' ? 'TCH' : ownerType === 'head' ? 'HEAD' : 'STF';
      const year = new Date().getFullYear();
      const start = new Date(`${year}-01-01T00:00:00Z`);
      const end = new Date(`${year}-12-31T23:59:59Z`);
      const count = await IDCard.countDocuments({
        ownerType,
        institutionId: doc.institutionId,
        issuedAt: { $gte: start, $lte: end },
      });
      const cardNumber = `${prefix}-${year}-${String((count || 0) + 1).padStart(6, '0')}`;

      const now = new Date();
      const validityEnd = new Date(now);
      validityEnd.setFullYear(validityEnd.getFullYear() + 1);

      await IDCard.create({
        ownerId: doc.userId,
        ownerType,
        cardNumber,
        cardType: ownerType,
        photoUrl: '',
        qrCodeData: `easy_school://idcard/${cardNumber}`,
        barcodeData: cardNumber,
        validityStart: now,
        validityEnd,
        status: 'active',
        issuedBy: doc.userId,
        issuedAt: now,
        institutionId: doc.institutionId,
        downloadCount: 0,
      });

      let modelName = 'Student';
      if (ownerType === 'teacher') modelName = 'Teacher';
      else if (ownerType === 'staff') modelName = 'Staff';

      const Model = mongoose.model(modelName);
      await Model.updateOne(
        { _id: doc._id },
        { $set: { idCardNumber: cardNumber, idCardExpiry: validityEnd } }
      );
    }
  } catch (error) {
    console.error(`Failed to auto-generate ${ownerType} ID card:`, error);
  }
}
