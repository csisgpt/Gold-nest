import { HttpModule, HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { DoListAsnadRequestDto } from './dto/list-documents.dto';
import { GetMandeHesabByCodeRequestDto } from './dto/customer-balance.dto';
import { TahesabHttpClient } from './tahesab-http.client';
import { TahesabService } from './tahesab.service';
import { DoNewMoshtariRequestDto } from './dto/moshtari.dto';
import { GetMojoodiAbshodeRequestDto } from './dto/inventory.dto';
import { DoListEtiketRequestDto } from './dto/etiket.dto';
import { DoNewSanadGoldRequestDto } from './dto/sanad.dto';

describe('TahesabService', () => {
  let service: TahesabService;
  let httpService: HttpService;
  let configGetMock: jest.Mock;

  beforeEach(async () => {
    configGetMock = jest.fn((key: string) => {
      if (key === 'TAHESAB_AUTH_TOKEN') {
        return 'token';
      }
      if (key === 'TAHESAB_DB_NAME') {
        return 'DB1';
      }
      return undefined;
    });

    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule],
      providers: [
        TahesabService,
        TahesabHttpClient,
        {
          provide: ConfigService,
          useValue: { get: configGetMock },
        },
      ],
    }).compile();

    service = module.get<TahesabService>(TahesabService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('wraps method call in envelope', async () => {
    const response = { ok: true };
    jest.spyOn(httpService, 'post').mockReturnValue(of({ data: response } as any));

    const result = await service.callMethod('Ping', []);

    expect(httpService.post).toHaveBeenCalledWith('/', { Ping: [] }, expect.any(Object));
    expect(result).toEqual(response);
  });

  it('maps createCustomer dto into ordered array payload', async () => {
    const dto: DoNewMoshtariRequestDto = {
      name: 'John',
      groupName: 'VIP',
      tel: '021',
      address: 'Addr',
      nationalCode: '1234567890',
      birthDateShamsi: '1400/01/01',
      referrerName: 'Ref',
      referrerCode: '9',
      moshtariCode: 'MC',
      jensFelez: 1,
    };
    const spy = jest
      .spyOn(service as any, 'callMethod')
      .mockResolvedValue({ moshtariCode: 'MC' });

    await service.createCustomer(dto);

    expect(spy).toHaveBeenCalledWith('DoNewMoshtari', [
      dto.name,
      dto.groupName,
      dto.tel,
      dto.address,
      dto.nationalCode,
      dto.birthDateShamsi,
      dto.referrerName,
      dto.referrerCode,
      dto.moshtariCode,
      dto.jensFelez,
    ]);
  });

  it('maps listDocuments dto into ordered array payload', async () => {
    const dto: DoListAsnadRequestDto = {
      countLast: 10,
      customerCode: 'C1',
      fromDateShamsi: '1403/01/01',
      toDateShamsi: '1403/01/30',
      filterNoSanad: '123',
      jensFelez: 0,
    };
    const spy = jest
      .spyOn(service as any, 'callMethod')
      .mockResolvedValue({} as any);

    await service.listDocuments(dto);

    expect(spy).toHaveBeenCalledWith('DoListAsnad', [
      dto.countLast,
      dto.customerCode,
      dto.fromDateShamsi,
      dto.toDateShamsi,
      dto.filterNoSanad,
      dto.jensFelez,
    ]);
  });

  it('maps getBalanceByCustomerCode to expected method name and payload', async () => {
    const dto: GetMandeHesabByCodeRequestDto = { customerCodes: ['CUST-1', 'CUST-2'] };
    const spy = jest
      .spyOn(service as any, 'callMethod')
      .mockResolvedValue({ balance: 0 });

    await service.getBalanceByCustomerCode(dto);

    expect(spy).toHaveBeenCalledWith('getmandehesabbycode', [dto.customerCodes]);
  });

  it('maps getAbshodeInventory parameters into documented array', async () => {
    const dto: GetMojoodiAbshodeRequestDto = { ayar: 750, jensFelez: 0 };
    const spy = jest
      .spyOn(service as any, 'callMethod')
      .mockResolvedValue({});

    await service.getAbshodeInventory(dto);

    expect(spy).toHaveBeenCalledWith('GetMojoodiAbshodeMotefareghe', [
      dto.ayar,
      dto.jensFelez,
    ]);
  });

  it('maps listEtikets parameters including withPhoto flag', async () => {
    const dto: DoListEtiketRequestDto = { fromCode: '1', toCode: '5', withPhoto: true };
    const spy = jest
      .spyOn(service as any, 'callMethod')
      .mockResolvedValue({});

    await service.listEtikets(dto);

    expect(spy).toHaveBeenCalledWith('DoListEtiket', [dto.fromCode, dto.toCode, 1]);
  });

  it('maps createGoldVoucher parameters into ordered array', async () => {
    const dto: DoNewSanadGoldRequestDto = {
      sabteKolOrMovaghat: 1,
      moshtariCode: '100',
      factorNumber: 'F1',
      radifNumber: 1,
      shamsiYear: '1403',
      shamsiMonth: '01',
      shamsiDay: '02',
      vazn: 10,
      ayar: 750,
      angNumber: 'ANG',
      nameAz: 'TEST',
      isVoroodOrKhorooj: 1,
      isMotefaregheOrAbshode: 0,
      sharh: 'desc',
      factorCode: 'FC',
      havalehBeMcode: '200',
      multiRadif: 0,
      jensFelez: 0,
    };
    const spy = jest
      .spyOn(service as any, 'callMethod')
      .mockResolvedValue({});

    await service.createGoldVoucher(dto);

    expect(spy).toHaveBeenCalledWith('DoNewSanadVKHGOLD', [
      dto.sabteKolOrMovaghat,
      dto.moshtariCode,
      dto.factorNumber,
      dto.radifNumber,
      dto.shamsiYear,
      dto.shamsiMonth,
      dto.shamsiDay,
      dto.vazn,
      dto.ayar,
      dto.angNumber,
      dto.nameAz,
      dto.isVoroodOrKhorooj,
      dto.isMotefaregheOrAbshode,
      dto.sharh,
      dto.factorCode,
      dto.havalehBeMcode,
      dto.multiRadif,
      dto.jensFelez,
    ]);
  });
});
